declare module "pdf-parse" {
  type PdfParseResult = {
    text: string;
    numpages: number;
  };

  function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
