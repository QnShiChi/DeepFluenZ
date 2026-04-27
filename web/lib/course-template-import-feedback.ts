type ImportStatus = "backbone_only" | "enriched";

interface ImportReportLike {
  status?: ImportStatus;
  warning_count?: number;
}

interface CourseTemplateImportResponseLike {
  import_report?: ImportReportLike | null;
  warnings?: string[];
}

export function describeCourseTemplateImport(response: CourseTemplateImportResponseLike): {
  variant: "success" | "warning";
  message: string;
} {
  const status = response.import_report?.status;
  const warnings = (response.warnings ?? []).filter((warning) => warning.trim().length > 0);

  if (status === "backbone_only") {
    const detail = warnings.length > 0 ? ` Warning: ${warnings.join(" ")}` : "";
    return {
      variant: "warning",
      message: `Đã import một phần. Graph khung đã được lưu nhưng bước enrichment chưa hoàn tất.${detail}`,
    };
  }

  return {
    variant: "success",
    message: "Đã import đề cương thành công và sinh knowledge graph đầy đủ.",
  };
}
