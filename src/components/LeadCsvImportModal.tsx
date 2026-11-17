import { useState, type ChangeEvent } from "react";
import { Download, Upload, X } from "lucide-react";
import { parseLeadCsv, type LeadCsvPreview } from "../lib/leadCsvImport";
import { bulkCreateLeads } from "../services/leads";

type Props = {
  organizationId: string;
  onClose: () => void;
  onImported: (result: { imported: number; duplicates: number; invalidRows: number; error?: string }) => void;
  onNotify: (message: string) => void;
};

const maximumFileBytes = 2 * 1024 * 1024;
const previewRows = 10;

export function LeadCsvImportModal({ organizationId, onClose, onImported, onNotify }: Props) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<LeadCsvPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setFileName("");
    setErrorMessage("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMessage("Choose a .csv file.");
      return;
    }
    if (file.size > maximumFileBytes) {
      setErrorMessage("CSV files must be 2 MB or smaller.");
      return;
    }
    try {
      const parsed = parseLeadCsv(await file.text());
      setPreview(parsed);
      setFileName(file.name);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The CSV file could not be read.");
    }
  };

  const importValidRows = async () => {
    if (!preview) return;
    const validRows = preview.rows.flatMap((row) => row.lead ? [row.lead] : []);
    if (!validRows.length) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await bulkCreateLeads(organizationId, validRows);
      if (result.error && !result.imported) {
        setErrorMessage(result.error);
        return;
      }
      onImported({ ...result, invalidRows: invalidCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Leads could not be imported.";
      setErrorMessage(message);
      onNotify(message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(
      ["Name,Phone,Email,Company,City,State,Source,Status\r\nRiya Sharma,+919876543210,riya@example.com,Acme,Mumbai,Maharashtra,Website,New\r\n"],
      { type: "text/csv;charset=utf-8" },
    ));
    link.download = "adometa-leads-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const invalidCount = preview?.rows.filter((row) => !row.lead).length ?? 0;
  const validCount = preview?.rows.length ? preview.rows.length - invalidCount : 0;

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="modal lead-import-modal" role="dialog" aria-modal="true" aria-labelledby="lead-import-title">
      <div className="modal-head">
        <div><p className="eyebrow">LEAD MANAGEMENT</p><h2 id="lead-import-title">Import leads from CSV</h2><p className="muted">Upload up to 2,000 rows. Only valid rows will be added to this organization.</p></div>
        <button type="button" className="icon-button" aria-label="Close import dialog" disabled={busy} onClick={onClose}><X size={18} /></button>
      </div>
      <div className="lead-import-toolbar">
        <label className="button secondary lead-import-file"><Upload size={16} /> Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} disabled={busy} /></label>
        <button type="button" className="text-button" onClick={downloadTemplate}><Download size={15} /> Download template</button>
      </div>
      {fileName && <p className="muted">Selected: {fileName}</p>}
      {errorMessage && <p className="profile-error" role="alert">{errorMessage}</p>}
      {preview && <>
        <div className="lead-import-summary" role="status">
          <strong>{validCount} ready to import</strong><span>{invalidCount} invalid or duplicate rows will be skipped.</span>
        </div>
        <div className="table-scroll lead-import-preview">
          <table><thead><tr><th>CSV ROW</th><th>NAME</th><th>PHONE / EMAIL</th><th>RESULT</th></tr></thead><tbody>
            {preview.rows.slice(0, previewRows).map((row) => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td><td>{row.lead?.full_name || "—"}</td>
              <td>{row.lead?.phone || row.lead?.email || "—"}</td>
              <td>{row.errors.length ? row.errors.join(" ") : "Ready"}</td>
            </tr>)}
          </tbody></table>
          {preview.rows.length > previewRows && <p className="muted">Showing the first {previewRows} of {preview.rows.length} rows.</p>}
        </div>
      </>}
      <p className="muted">Supported columns: Name (required), Phone, Email, Company, City, State, Source, Status. Duplicate contact details within the CSV are skipped.</p>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="button primary" disabled={busy || !validCount} onClick={() => void importValidRows()}><Upload size={16} /> {busy ? "Importing…" : `Import ${validCount} leads`}</button>
      </div>
    </section>
  </div>;
}
