import React, { useCallback, useState } from "react";
import { useStore } from "../store";
import { extractQuestionsFromImage } from "../services/geminiService";
import { convertPdfToImages } from "../services/pdfService";
import { Upload, AlertCircle, Loader2 } from "lucide-react";
import { Question } from "../types";

const UploadZone: React.FC = () => {
  const {
    setProcessing,
    setQuestions,
    addQuestions,
    setImage,
    setPdfPages,
    setError,
    isProcessing,
    error,
  } = useStore();

  const [loadingStatus, setLoadingStatus] = useState<string>("");

  const handleFile = async (file: File) => {
    if (!file) return;

    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(
      file.type
    );
    const isPdf = file.type === "application/pdf";

    if (!isImage && !isPdf) {
      setError("Chỉ hỗ trợ file ảnh (JPG, PNG, WEBP) hoặc PDF.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("File quá lớn (>20MB). Vui lòng nén file.");
      return;
    }

    setError(null);
    setProcessing(true);
    setLoadingStatus("Đang xử lý file...");

    try {
      let pageImages: string[] = [];

      if (isPdf) {
        setLoadingStatus("Đang chuyển đổi PDF sang hình ảnh...");
        pageImages = await convertPdfToImages(file);
      } else {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        pageImages = [base64];
      }

      if (pageImages.length === 0) {
        throw new Error("Không tìm thấy dữ liệu ảnh.");
      }

      setImage(pageImages[0]);
      setPdfPages(pageImages);
      setQuestions([]);

      let hasFoundAnyQuestion = false;
      let errorPages = 0;

      // PROCESS EACH PAGE
      for (let i = 0; i < pageImages.length; i++) {
        setLoadingStatus(
          `Đang đọc và giải trang ${i + 1} / ${pageImages.length}...`
        );

        try {
          // Optimized: Single API call extracts AND solves
          const newQs = await extractQuestionsFromImage(pageImages[i]);

          if (newQs.length > 0) {
            hasFoundAnyQuestion = true;
            addQuestions(newQs);
          }
        } catch (pageError) {
          console.error(`Lỗi xử lý trang ${i + 1}:`, pageError);
          errorPages++;
        }

        // Small delay between pages
        if (i < pageImages.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!hasFoundAnyQuestion) {
        throw new Error("AI không tìm thấy câu hỏi nào (hoặc API bị quá tải).");
      }

      if (errorPages > 0) {
        setError(
          `Có ${errorPages} trang bị lỗi. Các trang khác vẫn hiển thị bình thường.`
        );
      }
    } catch (err: any) {
      setError(err.message || "Đã có lỗi xảy ra.");
      console.error(err);
    } finally {
      setProcessing(false);
      setLoadingStatus("");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
      <div
        className={`
          w-full max-w-2xl border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
          ${
            isProcessing
              ? "border-bee-400 bg-bee-50 opacity-50 pointer-events-none"
              : "border-gray-300 hover:border-bee-500 hover:bg-gray-50"
          }
        `}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => document.getElementById("file-upload")?.click()}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept="image/*,.pdf"
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center animate-pulse">
            <Loader2 className="w-16 h-16 text-bee-500 animate-spin mb-4" />
            <h3 className="text-xl font-semibold text-gray-700">
              {loadingStatus || "AI đang phân tích..."}
            </h3>
            <p className="text-gray-500 mt-2">
              Nội dung sẽ hiển thị ngay khi quét xong.
            </p>
            <p className="text-xs text-bee-600 mt-2 font-medium">
              (Đã tích hợp tự động giải)
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-bee-100 rounded-full flex items-center justify-center mb-6">
              <Upload className="w-10 h-10 text-bee-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              Tải ảnh hoặc PDF lên
            </h3>
            <p className="text-gray-500 mb-6 max-w-md">
              Kéo thả file vào đây. Hỗ trợ JPG, PNG và file <strong>PDF</strong>
              .
            </p>
            <button className="bg-bee-500 hover:bg-bee-600 text-white font-medium py-2 px-6 rounded-lg transition-colors shadow-sm">
              Chọn file từ máy tính
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 flex items-center text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default UploadZone;
