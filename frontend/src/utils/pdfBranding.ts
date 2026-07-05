import jsPDF from "jspdf";

const LOGO_URL = "/logo.png";
const BRAND_TITLE = "Anjuman-e-Zakereen Hussain AS. Karachi";

let logoDataUrlPromise: Promise<string | null> | null = null;

async function loadLogoDataUrl() {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(LOGO_URL)
      .then(async (response) => {
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      })
      .catch(() => null);
  }
  return logoDataUrlPromise;
}

type HeaderOptions = {
  reportTitle?: string;
  reportTitleAlign?: "left" | "center";
  subtitle?: string;
  subtitleAlign?: "left" | "center";
  metaLines?: string[];
  leftMargin?: number;
};

export async function addPdfBrandHeader(doc: jsPDF, options: HeaderOptions = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const leftMargin = options.leftMargin ?? 40;
  const logoSize = 56;
  const logoTopY = 18;
  const logoLeftX = (pageWidth - logoSize) / 2;
  const titleY = logoTopY + logoSize + 20;

  const logoDataUrl = await loadLogoDataUrl();
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", logoLeftX, logoTopY, logoSize, logoSize);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(BRAND_TITLE, pageWidth / 2, titleY, { align: "center" });

  let currentY = titleY + 22;

  if (options.reportTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    if (options.reportTitleAlign === "center") {
      doc.text(options.reportTitle, pageWidth / 2, currentY, { align: "center" });
    } else {
      doc.text(options.reportTitle, leftMargin, currentY);
    }
    currentY += 20;
  }

  if (options.subtitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    if (options.subtitleAlign === "center") {
      doc.text(options.subtitle, pageWidth / 2, currentY, { align: "center" });
    } else {
      doc.text(options.subtitle, leftMargin, currentY);
    }
    currentY += 18;
  }

  const metaLines = options.metaLines?.filter(Boolean) ?? [];
  if (metaLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    metaLines.forEach((line, index) => {
      doc.text(line, leftMargin, currentY + index * 14);
    });
    currentY += metaLines.length * 14;
  }

  return currentY + 16;
}
