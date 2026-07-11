export type PDFDocument = {
  id: string;
  fileName: string;
  size: number;
  uploadDate: string;
  pages: number;
  path: string;
  missing?: boolean;
};

export type ExtractedImage = {
  id: string;
  pdfId: string;
  pageNumber: number;
  width: number;
  height: number;
  format: string;
  fileSize: number;
  path: string;
  fileName: string;
  previewUrl: string;
};

export type Thumbnail = {
  pageNumber: number;
  previewUrl: string;
};
