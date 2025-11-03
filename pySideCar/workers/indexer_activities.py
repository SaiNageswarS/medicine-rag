import io
import logging
import os
import tempfile
from typing import Optional

from temporalio import activity

from azure_storage import AzureStorage

from workers.indexer_types import parse_section_chunk_file, Chunk
from workers.window_chunker import WindowChunker

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class IndexerActivities:
    def __init__(self, config: dict[str, str], azure_storage: AzureStorage):
        self._config = config
        self._azure_storage = azure_storage

        self.window_chunker = WindowChunker()
        
        # Configure Tesseract path if needed (for different OS environments)
        self._configure_tesseract()

    def _configure_tesseract(self):
        """Configure Tesseract OCR path for different environments."""
        try:
            import pytesseract
        except ImportError:
            logger.warning("pytesseract not available. OCR functionality will not work.")
            return
            
        # Try common Tesseract installation paths
        tesseract_paths = [
            '/usr/bin/tesseract',
            '/usr/local/bin/tesseract',
            '/opt/homebrew/bin/tesseract',  # macOS with Homebrew
            'tesseract'  # If it's in PATH
        ]
        
        for path in tesseract_paths:
            if os.path.exists(path) or path == 'tesseract':
                try:
                    pytesseract.pytesseract.tesseract_cmd = path
                    # Test if tesseract is working
                    pytesseract.get_tesseract_version()
                    logger.info(f"Tesseract configured at: {path}")
                    return
                except (OSError, RuntimeError) as e:
                    logger.warning(f"Tesseract at {path} not working: {e}")
                    continue
        
        logger.warning("Tesseract not found. OCR functionality may not work properly.")


    def _apply_ocr_to_pdf(self, pdf_path: str) -> str:
        """
        Apply OCR to a scanned PDF using PyMuPDF's built-in OCR.
        
        Args:
            pdf_path (str): Path to the original PDF file
            
        Returns:
            str: Path to the OCR-processed PDF file
        """
        try:
            import fitz  # PyMuPDF
        except ImportError as import_error:
            logger.error(f"PyMuPDF not available: {import_error}")
            return pdf_path
            
        try:
            logger.info(f"Applying OCR to PDF: {pdf_path}")
            
            # Open the original PDF
            doc = fitz.open(pdf_path)
            
            # Apply OCR to each page using PyMuPDF's built-in OCR
            for page_num in range(len(doc)):
                page = doc[page_num]
                logger.info(f"Processing page {page_num + 1}/{len(doc)}")
                
                # Use PyMuPDF's built-in OCR
                try:
                    page.get_pixmap().pdfocr_tobytes()
                    logger.info(f"OCR applied to page {page_num + 1}")
                except Exception as ocr_error:
                    logger.warning(f"OCR failed for page {page_num + 1}: {ocr_error}")
            
            # Save the OCR-processed PDF to a temporary file
            temp_fd, temp_path = tempfile.mkstemp(suffix='_ocr.pdf')
            os.close(temp_fd)
            doc.save(temp_path)
            doc.close()
            
            logger.info(f"OCR processing completed. Saved to: {temp_path}")
            return temp_path
            
        except (OSError, RuntimeError, ValueError) as e:
            logger.error(f"Error applying OCR to PDF: {e}")
            # Return original PDF path if OCR fails
            return pdf_path
    
    def _extract_text_with_custom_formatting(self, pdf_path: str) -> str:
        """Extract text using OCR and apply custom markdown formatting."""
        try:
            import fitz  # PyMuPDF
            import pytesseract
            from PIL import Image
        except ImportError as import_error:
            logger.error(f"Required libraries not available: {import_error}")
            return f"# {os.path.basename(pdf_path)}\n\n*OCR libraries not available.*"
            
        try:
            logger.info(f"Extracting text with custom formatting from: {pdf_path}")
            
            doc = fitz.open(pdf_path)
            all_text = []
            
            for page_num, page in enumerate(doc):
                logger.info(f"Processing page {page_num + 1}/{len(doc)}")
                
                # Render page as high-resolution image
                pix = page.get_pixmap(dpi=300)
                img_data = pix.tobytes("png")
                
                # Convert to PIL Image for OCR
                img = Image.open(io.BytesIO(img_data))
                
                # Extract text using pytesseract
                try:
                    ocr_text = pytesseract.image_to_string(img, lang='eng')
                    if ocr_text.strip():
                        # Format the OCR text
                        formatted_text = self._format_ocr_text(ocr_text.strip())
                        all_text.append(f"## Page {page_num + 1}\n\n{formatted_text}")
                except Exception as ocr_error:
                    logger.warning(f"OCR failed for page {page_num + 1}: {ocr_error}")
                    continue
            
            doc.close()
            
            if all_text:
                # Combine all pages with proper formatting
                full_text = "\n\n---\n\n".join(all_text)
                markdown_text = f"# {os.path.basename(pdf_path)}\n\n{full_text}"
                logger.info(f"Custom OCR extraction successful: {len(markdown_text)} characters")
                return markdown_text
            else:
                logger.error("No text could be extracted from any page")
                return f"# {os.path.basename(pdf_path)}\n\n*No text could be extracted from this document.*"
                
        except Exception as e:
            logger.error(f"Custom OCR extraction failed: {e}")
            return f"# {os.path.basename(pdf_path)}\n\n*OCR extraction failed: {e}*"
    
    def _format_ocr_text(self, text: str) -> str:
        """Format OCR text with proper markdown structure."""
        if not text or not text.strip():
            return text
            
        lines = text.strip().split('\n')
        formatted_lines = []
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                formatted_lines.append("")
                continue
            
            # Detect headings and sub-headings
            if self._is_main_heading(line, lines, i):
                formatted_lines.append(f"# {line}")
            elif self._is_sub_heading(line, lines, i):
                formatted_lines.append(f"## {line}")
            elif self._is_section_heading(line, lines, i):
                formatted_lines.append(f"### {line}")
            # Detect bold/important text
            elif self._is_bold_text(line):
                formatted_lines.append(f"**{line}**")
            # Detect list items
            elif self._is_list_item(line):
                formatted_lines.append(f"- {line}")
            # Detect numbered lists
            elif self._is_numbered_item(line):
                formatted_lines.append(f"1. {line}")
            # Regular text
            else:
                formatted_lines.append(line)
        
        return '\n'.join(formatted_lines)
    
    def _is_main_heading(self, line: str, all_lines: list, current_index: int) -> bool:
        """Detect main headings (H1)."""
        patterns = [
            # Very short, all caps titles
            len(line) < 30 and line.isupper() and len(line.split()) <= 4,
            # Common main heading keywords
            any(keyword in line.lower() for keyword in [
                'title', 'abstract', 'executive summary', 'introduction',
                'conclusion', 'summary', 'overview'
            ]),
            # Short lines that are likely main titles
            len(line) < 50 and line.isupper() and len(line.split()) <= 6
        ]
        return any(patterns)
    
    def _is_sub_heading(self, line: str, all_lines: list, current_index: int) -> bool:
        """Detect sub-headings (H2)."""
        patterns = [
            # Medium length, all caps
            len(line) < 60 and line.isupper() and len(line.split()) <= 8,
            # Common sub-heading keywords
            any(keyword in line.lower() for keyword in [
                'chapter', 'section', 'part', 'methodology', 'background',
                'results', 'discussion', 'analysis', 'findings', 'recommendations'
            ]),
            # Numbered sections
            any(line.startswith(f"{i}.") for i in range(1, 20)) and len(line) < 80,
            # Lines followed by empty lines (common heading pattern)
            current_index < len(all_lines) - 1 and not all_lines[current_index + 1].strip()
        ]
        return any(patterns)
    
    def _is_section_heading(self, line: str, all_lines: list, current_index: int) -> bool:
        """Detect section headings (H3)."""
        patterns = [
            # Shorter, all caps phrases
            len(line) < 40 and line.isupper() and len(line.split()) <= 5,
            # Common section keywords
            any(keyword in line.lower() for keyword in [
                'subsection', 'topic', 'area', 'aspect', 'component',
                'element', 'factor', 'issue', 'point', 'item'
            ]),
            # Lettered sections (A., B., C., etc.)
            len(line) > 2 and line[0].isupper() and line[1] == '.' and len(line) < 60
        ]
        return any(patterns)
    
    def _is_bold_text(self, line: str) -> bool:
        """Detect bold/important text."""
        patterns = [
            # Short all caps phrases
            len(line) < 30 and line.isupper() and len(line.split()) <= 4,
            # Common bold keywords
            any(keyword in line.lower() for keyword in [
                'note:', 'warning:', 'important:', 'caution:', 'tip:',
                'definition:', 'example:', 'figure:', 'table:', 'equation:',
                'key point:', 'remember:', 'attention:', 'alert:'
            ])
        ]
        return any(patterns)
    
    def _is_list_item(self, line: str) -> bool:
        """Detect list items."""
        patterns = [
            # Starts with bullet-like characters
            line.startswith(('•', '◦', '▪', '▫', '-', '*')),
            # Starts with lowercase letter followed by period
            len(line) > 2 and line[0].islower() and line[1] == '.',
            # Indented text (starts with spaces)
            line.startswith('  ') and not line.startswith('    ')
        ]
        return any(patterns)
    
    def _is_numbered_item(self, line: str) -> bool:
        """Detect numbered list items."""
        patterns = [
            # Starts with number followed by period
            any(line.startswith(f"{i}.") for i in range(1, 100)),
            # Starts with number followed by parenthesis
            any(line.startswith(f"{i})") for i in range(1, 100)),
            # Roman numerals
            any(line.startswith(f"{num}.") for num in ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'])
        ]
        return any(patterns)

    @activity.defn(name="convert_pdf_to_md")
    async def convert_pdf_to_md(self, tenant: str, pdf_file_name: str) -> str:
        """
        Convert a PDF file stored in Azure Blob Storage to Markdown format.
        Uses pymupdf4llm with OCR fallback if needed.

        Args:
            tenant (str): The tenant identifier.
            pdf_file_name (str): The name of the PDF file in Azure Blob Storage.

        Returns:
            str: The name of the converted Markdown file.
        """
        try:
            import pymupdf4llm
        except ImportError:
            logger.error("pymupdf4llm not available. Cannot convert PDF to Markdown.")
            raise

        logging.info(f"Starting conversion of {pdf_file_name} to Markdown")

        # Download the PDF file from Azure Blob Storage
        pdf_file_path = self._azure_storage.download_file(tenant, pdf_file_name)

        # First, try direct conversion with pymupdf4llm
        logging.info(f"Converting {pdf_file_name} to Markdown using pymupdf4llm")
        md_text = pymupdf4llm.to_markdown(pdf_file_path)
        
        # Check if markdown conversion resulted in empty content
        md_length = len(md_text) if md_text else 0
        logging.info(f"pymupdf4llm.to_markdown extracted {md_length} characters for {pdf_file_name}")
        
        if md_length < 100:
            logging.warning(f"pymupdf4llm.to_markdown returned empty content for {pdf_file_name}")
            logging.info("Applying OCR and retrying with pymupdf4llm")
            
            try:
                # Apply OCR to the PDF
                ocr_pdf_path = self._apply_ocr_to_pdf(pdf_file_path)
                
                # Use the OCR-processed PDF for markdown conversion
                md_text = pymupdf4llm.to_markdown(ocr_pdf_path)
                
                # Clean up the temporary OCR file
                try:
                    os.unlink(ocr_pdf_path)
                except OSError as cleanup_error:
                    logging.warning(f"Failed to clean up OCR file {ocr_pdf_path}: {cleanup_error}")
                    
                if md_text and md_text.strip():
                    logging.info(f"OCR + pymupdf4llm successful for {pdf_file_name}")
                else:
                    logging.error(f"OCR + pymupdf4llm also returned empty content for {pdf_file_name}")
                    # Try custom OCR text extraction with formatting
                    logging.info("Attempting custom OCR text extraction with formatting")
                    md_text = self._extract_text_with_custom_formatting(pdf_file_path)
                    
            except (OSError, RuntimeError, ValueError) as ocr_error:
                logging.error(f"OCR processing failed for {pdf_file_name}: {ocr_error}")
                # Return a placeholder if all methods fail
                md_text = f"# {pdf_file_name}\n\n*PDF content could not be extracted. This may be a scanned document or have complex formatting.*"

        # Upload the markdown content to Azure Blob Storage
        md_file_name = pdf_file_name.replace(".pdf", ".md")
        self._azure_storage.upload_bytes(tenant, md_file_name, md_text.encode("utf-8"))

        logging.info(f"Converted {pdf_file_name} to {md_file_name}")

        return md_file_name

    @activity.defn(name="window_section_chunks")
    async def window_section_chunks(
        self,
        tenant: str,
        md_section_json_urls: list[str],
        windows_output_path: str,
    ) -> list[str]:
        """
        Process Markdown sections into windowed chunks.

        Args:
            tenant (str): The tenant identifier.
            md_section_json_url (str): JSON URL of a single Markdown section.
            windows_output_path (str): Output path for the windowed chunks.
        Returns:
            list[str]: Storage blob path of windows.
        """
        logging.info(
            f"Processing {len(md_section_json_urls)} Markdown sections for tenant {tenant}"
        )

        result = []     # chunk blob paths
        previous_last_chunk: Optional[Chunk] = None

        for idx, md_section_json_url in enumerate(md_section_json_urls):
            md_section_json_file = self._azure_storage.download_file(
                tenant, md_section_json_url
            )
            md_section = parse_section_chunk_file(md_section_json_file)

            # Process the sections into windowed chunks
            for window_chunk in self.window_chunker.chunk_windows(md_section):
                if previous_last_chunk is not None:
                    # Link the previous chunk to the current one
                    previous_last_chunk.nextChunkId = window_chunk.chunkId
                    window_chunk.prevChunkId = previous_last_chunk.chunkId

                    # Upload the previous chunk to Azure Blob Storage
                    blob_path = f"{windows_output_path}/{previous_last_chunk.chunkId}.chunk.json"
                    self._azure_storage.upload_bytes(
                        tenant, blob_path, previous_last_chunk.to_json_bytes()
                    )

                    result.append(blob_path)

                # Update the previous chunk to the current one
                previous_last_chunk = window_chunk
            
            activity.heartbeat({"progress": f"{idx+1}/{len(md_section_json_urls)}"})
            logger.info(
                f"Processed section {idx + 1}/{len(md_section_json_urls)}: {md_section.chunkId}"
            )

        # Handle the last chunk
        if previous_last_chunk is not None:
            blob_path = f"{windows_output_path}/{previous_last_chunk.chunkId}.chunk.json"
            self._azure_storage.upload_bytes(
                tenant, blob_path, previous_last_chunk.to_json_bytes()
            )
            result.append(blob_path)

        return result
