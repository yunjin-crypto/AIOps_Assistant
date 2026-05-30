"""文件解析与文本切片服务"""
import os
from typing import List, Dict

DATA_DOCS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "docs")
DATA_DOCS_DIR = os.path.abspath(DATA_DOCS_DIR)

CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

# 支持的文件类型
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


def parse_file(file_path: str) -> str:
    """根据文件类型解析文本内容"""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        return _parse_pdf(file_path)
    elif ext == ".docx":
        return _parse_docx(file_path)
    elif ext in (".txt", ".md"):
        return _parse_text(file_path)
    else:
        raise ValueError(f"不支持的文件类型: {ext}")


def _parse_pdf(file_path: str) -> str:
    import pdfplumber
    text_parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def _parse_docx(file_path: str) -> str:
    from docx import Document
    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def _parse_text(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, chunk_overlap: int = CHUNK_OVERLAP) -> List[str]:
    """将文本切分为重叠的块，优先在段落/句子边界处断开"""
    if not text or not text.strip():
        return []

    chunks: List[str] = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunk = text[start:].strip()
            if chunk:
                chunks.append(chunk)
            break

        # 在当前窗口内寻找最佳断开点
        window = text[start:end]
        # 优先级：段落 > 换行 > 中文句号 > 英文句号
        last_break = -1
        for sep in ("\n\n", "\n", "。", ".", "；", ";"):
            pos = window.rfind(sep)
            if pos > chunk_size // 2:  # 断开点在后半部分才使用
                last_break = pos + len(sep)
                break

        if last_break > 0:
            end = start + last_break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - chunk_overlap

    return [c for c in chunks if c]


def process_file(file_path: str, filename: str) -> List[Dict]:
    """
    处理上传的文件：解析 + 切片
    返回: [{"text": "...", "chunk_index": 0, "filename": "..."}, ...]
    """
    text = parse_file(file_path)
    chunk_texts = chunk_text(text)

    chunks = []
    for i, chunk in enumerate(chunk_texts):
        chunks.append({
            "text": chunk,
            "chunk_index": i,
            "filename": filename,
        })

    return chunks


def save_uploaded_file(file_content: bytes, filename: str) -> str:
    """保存上传文件到 data/docs/，返回完整路径"""
    os.makedirs(DATA_DOCS_DIR, exist_ok=True)
    file_path = os.path.join(DATA_DOCS_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(file_content)
    return file_path


def delete_uploaded_file(filename: str) -> bool:
    """删除 data/docs/ 中的文件"""
    file_path = os.path.join(DATA_DOCS_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False
