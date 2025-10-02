#!/usr/bin/env python3
"""
answer_generator.py

Phase 6: Answer Generation with Citations (Final RAG Step)
- Compose strict prompt for LLM with selected passages
- Generate answers with explicit citations
- Post-process outputs for safety and format
- Integration with Phase 3-5 retrieval pipeline
"""

import os
import re
import json
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from dotenv import load_dotenv
from openai import OpenAI
from document_retriever import DocumentRetriever, DocumentChunk

# Load .env from current directory
current_dir = Path(__file__).parent
env_path = current_dir / '.env'
load_dotenv(dotenv_path=env_path, override=True)

@dataclass
class GeneratedAnswer:
    question: str
    answer: str
    confidence: str  # "high", "medium", "low"
    citations: List[Dict[str, str]]
    raw_passages: List[DocumentChunk]
    has_valid_citations: bool
    processing_notes: List[str]

class AnswerGenerator:
    def __init__(self):
        self.retriever = DocumentRetriever()
        
        # Ensure .env is loaded from the current directory
        load_dotenv(override=True)
        
        # Get API key with validation
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables. Please check your .env file.")
        
        self.client = OpenAI(api_key=api_key)
        
        # Configuration
        self.temperature = 0.0  # Strict setting to reduce hallucination
        self.max_context_length = 12000  # Increased to fit more passages (was 4000)
        self.model = "gpt-3.5-turbo"  # Can be upgraded to gpt-4
        
    def generate_answer(self, question: str, k_candidates: int = 20, 
                       top_passages: int = 5) -> GeneratedAnswer:
        """
        Phase 6 Main Pipeline:
        1. Retrieve relevant passages (Phase 3-5)
        2. Compose strict prompt with passages as context
        3. Generate answer with LLM (temperature=0)
        4. Post-process for safety and format
        """
        print(f"🤖 Phase 6: Generating answer for: '{question}'")
        
        # Step 1: Retrieve relevant passages using Phase 3-5
        print(f"\n📚 Step 1: Retrieving passages...")
        passages = self.retriever.retrieve_documents(
            query=question,
            k_candidates=k_candidates,
            top_passages=top_passages,
            use_hybrid=True,
            use_reranking=True
        )
        
        if not passages:
            return self._create_no_evidence_response(question, [])
        
        print(f"✅ Retrieved {len(passages)} passages for answer generation")
        
        # DEBUG: Show what passages were retrieved
        print(f"\n🔍 DEBUG: Retrieved passages:")
        for i, p in enumerate(passages, 1):
            print(f"  {i}. Rerank: {p.rerank_score:.3f} | Hybrid: {p.hybrid_score:.3f} | {p.doc_title[:50]}")
            print(f"     Chunk: {p.chunk_id} | Preview: {p.text[:150]}...")
        
        # Step 2: Compose strict prompt
        print(f"\n📝 Step 2: Composing strict prompt...")
        
        # Debug: Show what passages we retrieved
        print(f"🔎 DEBUG - Retrieved passages:")
        for i, p in enumerate(passages[:3], 1):
            preview = p.text[:100].replace('\n', ' ')
            print(f"   {i}. [{p.folder}] {preview}...")
            print(f"      Scores: V={p.vector_score:.3f}, H={p.hybrid_score:.3f}, R={p.rerank_score:.3f}")
        
        prompt, context_info = self._compose_strict_prompt(question, passages)
        
        # Step 3: Generate answer with LLM
        print(f"\n🧠 Step 3: Generating answer (temperature={self.temperature})...")
        raw_answer = self._call_llm(prompt)
        
        if not raw_answer:
            return self._create_error_response(question, passages, "LLM call failed")
        
        # Step 4: Post-process for safety and format
        print(f"\n🔍 Step 4: Post-processing and validation...")
        processed_answer = self._post_process_answer(question, raw_answer, passages)
        
        return processed_answer
    
    def _compose_strict_prompt(self, question: str, passages: List[DocumentChunk]) -> Tuple[str, Dict]:
        """Compose strict prompt with passages as context"""
        
        # Build context from passages
        context_parts = []
        total_length = 0
        used_passages = []
        
        # Truncate passages to ensure we fit at least top 5
        max_passage_length = 2000  # Limit each passage to 2000 chars
        
        for i, passage in enumerate(passages):
            # Truncate passage text if too long
            passage_text_content = passage.text
            if len(passage_text_content) > max_passage_length:
                passage_text_content = passage_text_content[:max_passage_length] + "...[truncated]"
            
            # Format passage with citation info
            citation_id = f"[{passage.doc_title}] — page {passage.page_start}-{passage.page_end} — {passage.chunk_id}"
            passage_text = f"PASSAGE {i+1}:\nCitation: {citation_id}\nContent: {passage_text_content}\n"
            
            # Check length limit
            if total_length + len(passage_text) <= self.max_context_length:
                context_parts.append(passage_text)
                used_passages.append(passage)
                total_length += len(passage_text)
            else:
                break
        
        context = "\n".join(context_parts)
        
        # Strict prompt template
        prompt = f"""You are an expert assistant for the American College of Emergency Physicians (ACEP). Answer the question using ONLY the provided passages below.

STRICT INSTRUCTIONS:
1. Answer using ONLY information from the provided passages
2. For EVERY fact or claim, include a citation in this exact format: [doc_title] — page X-Y — chunk_id
3. If the passages don't contain enough information to answer the question, respond with "I do not have sufficient information in the provided documents to answer this question."
4. Do NOT add information not found in the passages
5. Do NOT make assumptions or inferences beyond what's explicitly stated
6. Be precise and factual

PASSAGES:
{context}

QUESTION: {question}

ANSWER (with citations):"""

        # DEBUG: Show how many passages fit in context
        print(f"📊 Context stats: {len(used_passages)}/{len(passages)} passages fit in {total_length}/{self.max_context_length} chars")
        
        context_info = {
            "passages_used": len(used_passages),
            "total_passages": len(passages),
            "context_length": len(context)
        }
        
        return prompt, context_info
    
    def _call_llm(self, prompt: str) -> Optional[str]:
        """Call LLM with strict settings"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system", 
                        "content": "You are a precise, factual assistant that only uses provided information and always includes proper citations."
                    },
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ],
                temperature=self.temperature,  # 0.0 for consistency
                max_tokens=800,
                top_p=1.0,
                frequency_penalty=0.0,
                presence_penalty=0.0
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            print(f"❌ LLM call failed: {e}")
            return None
    
    def _post_process_answer(self, question: str, raw_answer: str, 
                           passages: List[DocumentChunk]) -> GeneratedAnswer:
        """Post-process LLM output for safety and format"""
        
        processing_notes = []
        
        # Check for "I do not know" responses
        if self._is_insufficient_evidence_response(raw_answer):
            return self._create_no_evidence_response(question, passages, raw_answer)
        
        # Extract and validate citations
        citations, citation_validation = self._extract_and_validate_citations(raw_answer, passages)
        processing_notes.extend(citation_validation["notes"])
        
        # Determine confidence based on citation quality and passage relevance
        confidence = self._determine_confidence(citations, passages, raw_answer)
        
        # Format answer nicely
        formatted_answer = self._format_answer(raw_answer)
        
        # Final safety check
        has_valid_citations = len(citations) > 0 and citation_validation["valid"]
        
        if not has_valid_citations:
            processing_notes.append("WARNING: No valid citations found in answer")
            formatted_answer = "Source not found. The answer could not be properly cited."
            confidence = "low"
        
        return GeneratedAnswer(
            question=question,
            answer=formatted_answer,
            confidence=confidence,
            citations=citations,
            raw_passages=passages,
            has_valid_citations=has_valid_citations,
            processing_notes=processing_notes
        )
    
    def _extract_and_validate_citations(self, answer: str, passages: List[DocumentChunk]) -> Tuple[List[Dict], Dict]:
        """Extract and validate citations from the answer"""
        
        # Pattern to match citations: [doc_title] — page X-Y — chunk_id
        citation_pattern = r'\[([^\]]+)\]\s*—\s*page\s*(\d+(?:-\d+)?)\s*—\s*([^\s\]]+)'
        
        found_citations = re.findall(citation_pattern, answer)
        
        citations = []
        valid_citations = 0
        notes = []
        
        # Available passages for validation
        passage_lookup = {p.chunk_id: p for p in passages}
        
        for doc_title, page_range, chunk_id in found_citations:
            citation_dict = {
                "doc_title": doc_title.strip(),
                "page_range": page_range.strip(),
                "chunk_id": chunk_id.strip(),
                "valid": False
            }
            
            # Validate against actual passages
            if chunk_id.strip() in passage_lookup:
                passage = passage_lookup[chunk_id.strip()]
                if doc_title.strip() in passage.doc_title:
                    citation_dict["valid"] = True
                    valid_citations += 1
                else:
                    notes.append(f"Citation mismatch: {chunk_id} doc title doesn't match")
            else:
                notes.append(f"Citation not found in passages: {chunk_id}")
            
            citations.append(citation_dict)
        
        validation_result = {
            "valid": valid_citations > 0,
            "total_citations": len(citations),
            "valid_citations": valid_citations,
            "notes": notes
        }
        
        return citations, validation_result
    
    def _determine_confidence(self, citations: List[Dict], passages: List[DocumentChunk], answer: str) -> str:
        """Determine confidence based on citations and passage quality"""
        
        if not citations:
            return "low"
        
        valid_citations = sum(1 for c in citations if c.get("valid", False))
        citation_ratio = valid_citations / len(citations) if citations else 0
        
        # High confidence: multiple valid citations, good passage coverage
        if valid_citations >= 2 and citation_ratio >= 0.8 and len(passages) >= 3:
            return "high"
        
        # Medium confidence: at least one valid citation
        if valid_citations >= 1 and citation_ratio >= 0.5:
            return "medium"
        
        # Low confidence: poor citation quality
        return "low"
    
    def _format_answer(self, raw_answer: str) -> str:
        """Format the answer nicely for UI"""
        
        # Clean up extra whitespace
        formatted = re.sub(r'\n\s*\n', '\n\n', raw_answer.strip())
        
        # Ensure proper punctuation
        if formatted and not formatted.endswith(('.', '!', '?')):
            formatted += '.'
        
        return formatted
    
    def _is_insufficient_evidence_response(self, answer: str) -> bool:
        """Check if the answer indicates insufficient evidence"""
        insufficient_phrases = [
            "i do not have sufficient information",
            "i don't have enough information",
            "insufficient information",
            "not enough information",
            "i do not know",
            "i don't know",
            "cannot answer"
        ]
        
        answer_lower = answer.lower()
        return any(phrase in answer_lower for phrase in insufficient_phrases)
    
    def _create_no_evidence_response(self, question: str, passages: List[DocumentChunk], 
                                   answer: str = None) -> GeneratedAnswer:
        """Create response for insufficient evidence"""
        
        if answer:
            formatted_answer = answer
        else:
            formatted_answer = "I do not have sufficient information in the provided documents to answer this question."
        
        return GeneratedAnswer(
            question=question,
            answer=formatted_answer,
            confidence="low",
            citations=[],
            raw_passages=passages,
            has_valid_citations=False,
            processing_notes=["Insufficient evidence in retrieved passages"]
        )
    
    def _create_error_response(self, question: str, passages: List[DocumentChunk], 
                              error_msg: str) -> GeneratedAnswer:
        """Create error response"""
        
        return GeneratedAnswer(
            question=question,
            answer=f"Error generating answer: {error_msg}",
            confidence="low",
            citations=[],
            raw_passages=passages,
            has_valid_citations=False,
            processing_notes=[f"Error: {error_msg}"]
        )
    
    def display_answer(self, result: GeneratedAnswer):
        """Display the complete answer with citations"""
        
        print("\n" + "="*80)
        print("🤖 PHASE 6: RAG ANSWER WITH CITATIONS")
        print("="*80)
        
        print(f"❓ Question: {result.question}")
        print(f"\n💡 Answer:")
        print(result.answer)
        
        print(f"\n🎯 Confidence: {result.confidence.upper()}")
        
        if result.citations:
            print(f"\n📚 Citations ({len(result.citations)} found):")
            for i, citation in enumerate(result.citations, 1):
                status = "✅" if citation.get("valid", False) else "❌"
                print(f"  {i}. {status} [{citation['doc_title']}] — page {citation['page_range']} — {citation['chunk_id']}")
        else:
            print(f"\n⚠️  No citations found")
        
        if result.processing_notes:
            print(f"\n📝 Processing Notes:")
            for note in result.processing_notes:
                print(f"  • {note}")
        
        print(f"\n📊 Technical Details:")
        print(f"  • Retrieved passages: {len(result.raw_passages)}")
        print(f"  • Valid citations: {result.has_valid_citations}")
        
        print("="*80)

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Phase 6: Answer Generation with Citations")
    parser.add_argument("--question", type=str, required=True, help="Question to answer")
    parser.add_argument("--candidates", type=int, default=20, help="Number of candidate passages (default: 20)")
    parser.add_argument("--passages", type=int, default=5, help="Number of top passages for context (default: 5)")
    parser.add_argument("--json", action="store_true", help="Output result as JSON")
    
    args = parser.parse_args()
    
    # Initialize answer generator
    generator = AnswerGenerator()
    
    # Generate answer
    result = generator.generate_answer(
        question=args.question,
        k_candidates=args.candidates,
        top_passages=args.passages
    )
    
    # Display result
    if args.json:
        # JSON output for integration
        result_dict = {
            "question": result.question,
            "answer": result.answer,
            "confidence": result.confidence,
            "citations": result.citations,
            "has_valid_citations": result.has_valid_citations,
            "processing_notes": result.processing_notes
        }
        print(json.dumps(result_dict, indent=2, ensure_ascii=False))
    else:
        # Human-readable display
        generator.display_answer(result)

if __name__ == "__main__":
    main()
