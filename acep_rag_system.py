#!/usr/bin/env python3
"""
acep_rag_system.py

Complete ACEP RAG System - All Phases Integrated
Combines Phase 1-6 for end-to-end question answering with ACEP documents
"""

import os
import sys
import json
from typing import Optional
from dotenv import load_dotenv
from answer_generator import AnswerGenerator, GeneratedAnswer

load_dotenv()

class ACEPRAGSystem:
    def __init__(self):
        self.answer_generator = AnswerGenerator()
        
    def ask(self, question: str, detailed_output: bool = True) -> GeneratedAnswer:
        """
        Complete RAG Pipeline - All Phases:
        Phase 1: Documents (already processed)
        Phase 2: Processing (already done)  
        Phase 3: Folder routing (integrated in retriever)
        Phase 4: Vector search + hybrid + reranking (integrated in retriever)
        Phase 5: Reranking and passage selection (integrated in retriever)
        Phase 6: Answer generation with citations
        """
        
        if detailed_output:
            print("🏥 ACEP RAG System - Complete Pipeline")
            print("="*50)
        
        # Execute complete pipeline
        result = self.answer_generator.generate_answer(question)
        
        if detailed_output:
            self.answer_generator.display_answer(result)
        
        return result
    
    def batch_questions(self, questions: list, output_file: Optional[str] = None) -> list:
        """Process multiple questions and optionally save to file"""
        
        results = []
        
        print(f"🔄 Processing {len(questions)} questions...")
        
        for i, question in enumerate(questions, 1):
            print(f"\n[{i}/{len(questions)}] Processing: {question[:50]}...")
            
            result = self.ask(question, detailed_output=False)
            results.append({
                "question": question,
                "answer": result.answer,
                "confidence": result.confidence,
                "citations": result.citations,
                "valid_citations": result.has_valid_citations
            })
            
            print(f"✅ Answer confidence: {result.confidence}")
        
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            print(f"\n💾 Results saved to: {output_file}")
        
        return results

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="ACEP RAG System - Complete Pipeline")
    parser.add_argument("--question", type=str, help="Single question to ask")
    parser.add_argument("--interactive", action="store_true", help="Interactive mode")
    parser.add_argument("--batch", type=str, help="File with questions (one per line)")
    parser.add_argument("--output", type=str, help="Output file for batch results")
    parser.add_argument("--examples", action="store_true", help="Run example questions")
    
    args = parser.parse_args()
    
    # Initialize system
    rag_system = ACEPRAGSystem()
    
    if args.examples:
        # Example questions
        example_questions = [
            "What is ACEP's position on corporate practice of medicine?",
            "What are ACEP's policies regarding noncompete agreements?",
            "What did ACEP say about CDC leadership changes?", 
            "What are the key governance policies in ACEP's bylaws?",
            "What is ACEP's stance on vaccine schedules?"
        ]
        
        print("🔍 Running Example Questions")
        print("="*40)
        
        for question in example_questions:
            print(f"\n📋 Question: {question}")
            result = rag_system.ask(question, detailed_output=False)
            print(f"💡 Answer: {result.answer[:200]}...")
            print(f"🎯 Confidence: {result.confidence}")
            if result.citations:
                print(f"📚 Citations: {len(result.citations)} sources")
    
    elif args.interactive:
        # Interactive mode
        print("🤖 ACEP RAG System - Interactive Mode")
        print("Type 'quit' or 'exit' to stop\n")
        
        while True:
            try:
                question = input("❓ Your question: ").strip()
                
                if question.lower() in ['quit', 'exit', 'q']:
                    break
                
                if not question:
                    continue
                
                result = rag_system.ask(question)
                print("\n" + "-"*50 + "\n")
                
            except KeyboardInterrupt:
                print("\n\n👋 Goodbye!")
                break
    
    elif args.batch:
        # Batch processing
        if not os.path.exists(args.batch):
            print(f"❌ File not found: {args.batch}")
            return
        
        with open(args.batch, 'r', encoding='utf-8') as f:
            questions = [line.strip() for line in f if line.strip()]
        
        rag_system.batch_questions(questions, args.output)
    
    elif args.question:
        # Single question
        result = rag_system.ask(args.question)
    
    else:
        # Show usage
        print("🏥 ACEP RAG System")
        print("="*30)
        print("Usage examples:")
        print('  python acep_rag_system.py --question "What are ACEP\'s policies?"')
        print("  python acep_rag_system.py --interactive")
        print("  python acep_rag_system.py --examples")
        print("  python acep_rag_system.py --batch questions.txt --output results.json")

if __name__ == "__main__":
    main()
