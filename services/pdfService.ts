import * as pdfjsLib from "pdfjs-dist";

// Set worker source to the same CDN version
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Converts a PDF file into an array of Base64 image strings (one per page).
 * @param file The PDF File object
 * @returns Promise resolving to string[] (base64 images)
 */
export const convertPdfToImages = async (file: File): Promise<string[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const images: string[] = [];
    const scale = 2.0; // Higher scale = better OCR quality (but slower/larger)

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Convert to JPEG for efficiency
      const base64 = canvas.toDataURL("image/jpeg", 0.8);
      images.push(base64);
    }

    return images;
  } catch (error) {
    console.error("PDF Conversion Error:", error);
    throw new Error("Không thể đọc file PDF. Vui lòng kiểm tra lại file.");
  }
};
