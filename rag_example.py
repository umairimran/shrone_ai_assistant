#!/usr/bin/env python3
"""
rag_example.py

Complete RAG example using Phase 3 + Phase 4 + LLM
Demonstrates end-to-end question answering with ACEP documents
"""

import os
from dotenv import load_dotenv
from openai import OpenAI
from document_retriever import DocumentRetriever

load_dotenv()

class ACEPQuestionAnswering:
    def __init__(self):
        self.retriever = DocumentRetriever()
        self.client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        
    def answer_question(self, question: str, max_context_length: int = 4000) -> dict:
        """
        Complete RAG pipeline:
        1. Retrieve relevant documents (Phase 3 + 4)
        2. Build context from top passages  
        3. Generate answer using LLM
        """
        
        print(f"🤔 Question: {question}")
        print("=" * 60)
        
        # Step 1: Retrieve relevant documents
        print("🔍 Step 1: Retrieving relevant documents...")
        documents = self.retriever.retrieve_documents(
            query=question,
            k_candidates=20,
            top_passages=5,
            use_hybrid=True,
            use_reranking=True
        )
        
        if not documents:
            return {
                "question": question,
                "answer": "I couldn't find any relevant documents to answer this question.",
                "sources": [],
                "confidence": "low"
            }
        
        print(f"✅ Found {len(documents)} relevant passages")
        
        # Step 2: Build context from passages
        print("📝 Step 2: Building context...")
        context_parts = []
        sources = []
        total_length = 0
        
        for i, doc in enumerate(documents):
            # Add passage with source attribution
            passage = f"[Source {i+1}: {doc.doc_title} - {doc.folder}]\\n{doc.text}\\n"
            
            if total_length + len(passage) <= max_context_length:
                context_parts.append(passage)
                sources.append({
                    "title": doc.doc_title,
                    "folder": doc.folder, 
                    "pages": f"{doc.page_start}-{doc.page_end}",
                    "relevance_score": doc.rerank_score
                })
                total_length += len(passage)
            else:
                break
        
        context = "\\n".join(context_parts)
        print(f"✅ Built context from {len(sources)} sources ({len(context)} chars)")
        
        # Step 3: Generate answer using LLM
        print("🧠 Step 3: Generating answer...")
        answer = self._generate_answer(question, context)
        
        return {
            "question": question,
            "answer": answer,
            "sources": sources,
            "confidence": "high" if len(sources) >= 3 else "medium"
        }
    
    def _generate_answer(self, question: str, context: str) -> str:
        """Generate answer using OpenAI API"""
        
        prompt = f"""You are an expert assistant for the American College of Emergency Physicians (ACEP). 
Answer the following question based ONLY on the provided context from ACEP documents.

Context from ACEP Documents:
{context}

Question: {question}

Instructions:
1. Provide a clear, accurate answer based only on the context provided
2. If the context doesn't contain enough information, say so
3. Cite sources when possible (e.g., "According to ACEP's policy document...")
4. Be specific about ACEP's positions, policies, or statements
5. Do not make up information not found in the context

Answer:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant specializing in ACEP policies and emergency medicine."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.1
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            return f"Error generating answer: {e}"

    def display_result(self, result: dict):
        """Display the complete Q&A result"""
        
        print("\\n" + "="*80)
        print("🎯 ACEP RAG SYSTEM RESULT")
        print("="*80)
        print(f"❓ Question: {result['question']}")
        print(f"\\n💡 Answer:")
        print(result['answer'])
        
        print(f"\\n📚 Sources ({result['confidence']} confidence):")
        for i, source in enumerate(result['sources'], 1):
            print(f"  {i}. {source['title']}")
            print(f"     Folder: {source['folder']}")
            print(f"     Pages: {source['pages']}")
            print(f"     Relevance: {source['relevance_score']:.3f}")
        
        print("="*80)

def main():
    # Example questions
    example_questions = [
        "What is ACEP's position on corporate practice of medicine?",
        "What are ACEP's policies regarding noncompete agreements?", 
        "What did ACEP say about CDC leadership changes?",
        "What are the key governance policies in ACEP's bylaws?",
        "What is ACEP's stance on vaccine schedules?"
    ]
    
    qa_system = ACEPQuestionAnswering()
    
    print("🏥 ACEP RAG Question Answering System")
    print("Combining Phase 3 Routing + Phase 4 Retrieval + LLM")
    print("="*60)
    
    # Parse command-line arguments
    import argparse
    parser = argparse.ArgumentParser(description="ACEP RAG Question Answering System")
    parser.add_argument("--question", "-q", type=str, help="Question to answer")
    args = parser.parse_args()
    
    if args.question:
        # Command line question
        question = args.question
        result = qa_system.answer_question(question)
        qa_system.display_result(result)
    else:
        # Interactive mode with example questions
        print("\\n📋 Example Questions:")
        for i, q in enumerate(example_questions, 1):
            print(f"  {i}. {q}")
        
        choice = input("\\nSelect a question (1-5) or type your own: ").strip()
        
        if choice.isdigit() and 1 <= int(choice) <= len(example_questions):
            question = example_questions[int(choice) - 1]
        else:
            question = choice
        
        result = qa_system.answer_question(question)
        qa_system.display_result(result)

if __name__ == "__main__":
    main()
