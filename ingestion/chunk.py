"""
Intelligent document chunking module.

Phase 3: Token-true chunking with tiktoken, sliding windows with overlap inside blocks.
"""

import re
from typing import List, Dict, Optional, Any

# Import tiktoken for accurate token counting
try:
    import tiktoken
except ImportError:
    tiktoken = None

from .schemas import Chunk


def chunk_blocks(blocks: List[Dict], max_tokens: int = 1000, overlap_tokens: int = 200, 
                tokenizer: Optional[Any] = None) -> List[Dict]:
    """
    Chunk blocks using real tokens with sliding windows and overlap.
    
    Phase 3: Token-true chunking using tiktoken (cl100k_base).
    
    Args:
        blocks: List of block dictionaries from structure detection
        max_tokens: Maximum tokens per chunk (default: 1000)
        overlap_tokens: Overlap tokens between chunks (default: 200)
        tokenizer: Optional tokenizer (uses tiktoken cl100k_base if None)
        
    Returns:
        List of chunk dictionaries with keys:
        - text: str (chunk content)
        - token_count: int (actual token count)
        - page_start: int (starting page number)
        - page_end: int (ending page number)
        - heading_path: list[str] (hierarchical heading path)
    """
    if not tiktoken:
        raise ImportError("tiktoken is required for token-based chunking. Install with: pip install tiktoken")
    
    # Initialize tokenizer
    if tokenizer is None:
        tokenizer = tiktoken.get_encoding("cl100k_base")
    
    chunks = []
    
    for block in blocks:
        block_text = block.get('text', '')
        if not block_text.strip():
            continue
            
        block_chunks = _chunk_single_block(
            block_text=block_text,
            block=block,
            max_tokens=max_tokens,
            overlap_tokens=overlap_tokens,
            tokenizer=tokenizer
        )
        chunks.extend(block_chunks)
    
    return chunks


def _chunk_single_block(block_text: str, block: Dict, max_tokens: int, 
                       overlap_tokens: int, tokenizer) -> List[Dict]:
    """
    Chunk a single block using sliding windows with token overlap.
    
    Args:
        block_text: Text content of the block
        block: Original block dictionary with metadata
        max_tokens: Maximum tokens per chunk
        overlap_tokens: Overlap tokens between chunks
        tokenizer: tiktoken tokenizer
        
    Returns:
        List of chunk dictionaries
    """
    # Tokenize the entire block
    tokens = tokenizer.encode(block_text)
    
    if len(tokens) <= max_tokens:
        # Block fits in one chunk
        return [{
            'text': block_text,
            'token_count': len(tokens),
            'page_start': block.get('page_start', 1),
            'page_end': block.get('page_end', 1),
            'heading_path': block.get('heading_path', [])
        }]
    
    chunks = []
    chunk_index = 0
    start_token = 0
    
    while start_token < len(tokens):
        # Calculate end token for this chunk
        end_token = min(start_token + max_tokens, len(tokens))
        
        # Extract chunk tokens
        chunk_tokens = tokens[start_token:end_token]
        
        # Decode back to text
        chunk_text = tokenizer.decode(chunk_tokens)
        
        # Try to avoid splitting in the middle of bullets/lists
        if end_token < len(tokens):  # Not the last chunk
            chunk_text = _adjust_chunk_boundary(chunk_text, block_text, start_token, tokenizer)
            # Re-tokenize after boundary adjustment
            chunk_tokens = tokenizer.encode(chunk_text)
        
        # Create chunk dictionary
        chunk = {
            'text': chunk_text.strip(),
            'token_count': len(chunk_tokens),
            'page_start': block.get('page_start', 1),
            'page_end': block.get('page_end', 1),
            'heading_path': block.get('heading_path', [])
        }
        
        chunks.append(chunk)
        chunk_index += 1
        
        # Calculate next start position with overlap
        if end_token >= len(tokens):
            break  # Last chunk
        
        # Move start position forward, accounting for overlap
        start_token = max(start_token + max_tokens - overlap_tokens, start_token + 1)
    
    return chunks


def _adjust_chunk_boundary(chunk_text: str, full_block_text: str, start_token: int, tokenizer) -> str:
    """
    Adjust chunk boundary to avoid splitting in the middle of bullets/lists.
    
    Args:
        chunk_text: Current chunk text
        full_block_text: Full block text for context
        start_token: Starting token position
        tokenizer: tiktoken tokenizer
        
    Returns:
        Adjusted chunk text with better boundary
    """
    # If chunk ends with incomplete bullet point or list item, try to find better boundary
    lines = chunk_text.split('\n')
    
    # Check if last few lines look like incomplete bullets/lists
    bullet_patterns = [
        r'^\s*[•·‣▪▫‣]\s*',     # Bullet points
        r'^\s*[-*+]\s*',        # Dash/asterisk bullets  
        r'^\s*\d+\.\s*',        # Numbered lists
        r'^\s*[a-zA-Z]\.\s*',   # Lettered lists
        r'^\s*\([a-zA-Z0-9]+\)\s*',  # Parenthetical lists
    ]
    
    # Look for better break point by scanning backwards
    for i in range(len(lines) - 1, max(0, len(lines) - 5), -1):
        line = lines[i].strip()
        
        # If line is empty or ends sentence, it's a good break point
        if not line or line.endswith(('.', '!', '?', ':')):
            better_chunk = '\n'.join(lines[:i+1])
            if better_chunk.strip():
                return better_chunk
        
        # Avoid breaking in middle of bullet point
        if any(re.match(pattern, line) for pattern in bullet_patterns):
            # Check if previous line would be a better break
            if i > 0:
                prev_line = lines[i-1].strip()
                if prev_line and (prev_line.endswith(('.', '!', '?', ':')) or not prev_line):
                    better_chunk = '\n'.join(lines[:i])
                    if better_chunk.strip():
                        return better_chunk
    
    # If no better boundary found, return original
    return chunk_text


def create_intelligent_chunks(text: str, target_tokens: int = 800, overlap_tokens: int = 200) -> List[Chunk]:
    """
    Create intelligent chunks from document text.
    
    Phase 3: Legacy wrapper for backward compatibility.
    
    Args:
        text: Cleaned document text
        target_tokens: Target tokens per chunk
        overlap_tokens: Overlap between chunks
        
    Returns:
        List of Chunk objects
    """
    if not tiktoken:
        raise ImportError("tiktoken is required for intelligent chunking. Install with: pip install tiktoken")
    
    # Create a single pseudo-block for the entire text
    pseudo_block = {
        'text': text,
        'page_start': 1,
        'page_end': 1,
        'heading_path': []
    }
    
    # Use the new block-based chunking
    chunk_dicts = chunk_blocks([pseudo_block], max_tokens=target_tokens, overlap_tokens=overlap_tokens)
    
    # Convert to Chunk objects
    chunks = []
    for i, chunk_dict in enumerate(chunk_dicts):
        chunk = Chunk(
            chunk_index=i,
            text=chunk_dict['text'],
            page_start=chunk_dict['page_start'],
            page_end=chunk_dict['page_end'],
            heading_path=chunk_dict['heading_path'],
            token_count=chunk_dict['token_count']
        )
        chunks.append(chunk)
    
    return chunks


def count_tokens(text: str) -> int:
    """
    Count tokens in text using tiktoken.
    
    Phase 3: Accurate token counting with tiktoken cl100k_base.
    
    Args:
        text: Text to count tokens for
        
    Returns:
        Number of tokens
    """
    if not tiktoken:
        # Fallback to word-based estimation if tiktoken not available
        words = text.split()
        return int(len(words) / 0.75) + 1
    
    tokenizer = tiktoken.get_encoding("cl100k_base")
    return len(tokenizer.encode(text))


def split_by_paragraphs(text: str) -> List[str]:
    """
    Split text into paragraphs while preserving structure.
    
    Phase 3: Paragraph-based splitting for chunk boundaries.
    
    Args:
        text: Text to split
        
    Returns:
        List of paragraph strings
    """
    # Split by double newlines (paragraph breaks)
    paragraphs = re.split(r'\n\s*\n', text)
    
    # Clean up and filter empty paragraphs
    cleaned_paragraphs = []
    for para in paragraphs:
        para = para.strip()
        if para:
            cleaned_paragraphs.append(para)
    
    return cleaned_paragraphs


def split_by_sentences(text: str) -> List[str]:
    """
    Split text into sentences for fine-grained chunking.
    
    Phase 3: Sentence-based splitting for precise boundaries.
    
    Args:
        text: Text to split
        
    Returns:
        List of sentence strings
    """
    # Basic sentence splitting on periods, exclamation marks, question marks
    # This is a simple implementation - could be enhanced with more sophisticated NLP
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    # Clean up and filter empty sentences
    cleaned_sentences = []
    for sentence in sentences:
        sentence = sentence.strip()
        if sentence:
            cleaned_sentences.append(sentence)
    
    return cleaned_sentences