import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Eye, History, RotateCcw, UploadCloud } from "lucide-react";
import { API_CONTRACT_STATUS, RIDEX_API } from "../lib/apiContract";
import { request } from "../lib/api";

type Asset = {
  id: string;
  appTarget: string;
  screenKey: string;
  sectionKey?: string | null;
  placementKey?: string | null;
  assetKey: string;
  name: string;
  scopeType?: string | null;
  stateId?: string | null;
  cityId?: string | null;
  currentVersion: number;
  active: boolean;
  current?: {
    id?: string;
    version?: number;
    downloadUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    checksum?: string | null;
    createdAt?: string | null;
  } | null;
};

type Target = "ALL" | "CUSTOMER" | "DRIVER" | "SHARED";

type Slot = readonly [
  appTarget: "CUSTOMER" | "DRIVER" | "SHARED",
  screenKey: string,
  placementKey: string,
  sectionKey: string,
  name: string,
  recommended: string,
  ratio: string,
];

const SLOTS: Slot[] = [
  ["CUSTOMER", "HOME", "HERO", "HOME", "Customer Home Hero", "1600×600", "8:3"],
  ["CUSTOMER", "DISPLAY", "UNTOUCHABLE", "DISPLAY", "Customer Untouchable Display", "1200×675", "16:9"],
  ["DRIVER", "HOME", "HERO", "HOME", "Driver Home Hero", "1600×600", "8:3"],
  ["DRIVER", "DISPLAY", "UNTOUCHABLE", "DISPLAY", "Driver Untouchable Display", "1200×675", "16:9"],
  ["SHARED", "DISPLAY", "UNTOUCHABLE", "DISPLAY", "Shared Untouchable Display", "1200×675", "16:9"],
  ["CUSTOMER", "LOGIN", "PROMO", "LOGIN", "Customer Login Promotional", "1200×600", "2:1"],
  ["DRIVER", "LOGIN", "PROMO", "LOGIN", "Driver Login Promotional", "1200×600", "2:1"],
] as const;

const MAX_UPLOAD_BYTES = 1_250_000;
const ASSET_MUTATIONS_ENABLED = String(API_CONTRACT_STATUS) === "VERIFIED_AGAINST_BACKEND_SOURCE";

function slotKey(slot: Slot) {
  return `${slot[0]}:${slot[1]}:${slot[2]}:${slot[3]}`;
}

function assetKey(asset: Asset) {
  return `${String(asset.appTarget || "").toUpperCase()}:${String(asset.screenKey || "").toUpperCase()}:${String(asset.placementKey || "").toUpperCase()}:${String(asset.sectionKey || "").toUpperCase()}`;
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to inspect image dimensions"));
    };
    image.src = url;
  });
}

async function matchesImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mime = file.type.toLowerCase();
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mime === "image/webp") {
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

const assetCatalogRequests = new Map<string, Promise<Asset[]>>();

function getAssetCatalogue(path: string): Promise<Asset[]> {
  const existing = assetCatalogRequests.get(path);
  if (existing) return existing;

  let pending: Promise<Asset[]>;
  pending = request<Asset[]>(path).finally(() => {
    if (assetCatalogRequests.get(path) === pending) {
      assetCatalogRequests.delete(path);
    }
  });
  assetCatalogRequests.set(path, pending);
  return pending;
}
export function AssetManager() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [catalogueLoadError, setCatalogueLoadError] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<Target>("ALL");
  const [selected, setSelected] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshSequence = useRef(0);

  const refresh = async () => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    setError("");
    setCatalogueLoadError(false);
    try {
      const query = target === "ALL" ? "" : `?appTarget=${encodeURIComponent(target)}`;
      const result = await getAssetCatalogue(`${RIDEX_API.admin.assets}${query}`);
      if (sequence !== refreshSequence.current) return;
      setAssets(Array.isArray(result) ? result : []);
      setHasLoaded(true);
      setCatalogueLoadError(false);
    } catch (e) {
      if (sequence !== refreshSequence.current) return;
      setCatalogueLoadError(true);
      setError(e instanceof Error ? e.message : "Unable to load assets");
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    return () => { refreshSequence.current += 1; };
  }, [target]);

  const grouped = useMemo(() => new Map(assets.map((asset) => [assetKey(asset), asset])), [assets]);
  const visibleSlots = useMemo(() => (target === "ALL" ? SLOTS : SLOTS.filter((slot) => slot[0] === target)), [target]);
  const selectedSlot = useMemo(() => visibleSlots.find((slot) => slotKey(slot) === selected) || null, [selected, visibleSlots]);
  const selectedAsset = selectedSlot ? grouped.get(slotKey(selectedSlot)) : null;

  const chooseSlot = (slot: Slot) => {
    setSelected(slotKey(slot));
    setError("");
    setMessage("");
  };

  const chooseFile = async (next: File | null) => {
    setFile(next);
    setDimensions(null);
    if (next) {
      try {
        setDimensions(await readImageSize(next));
      } catch {
        setDimensions(null);
      }
    }
  };

  const upload = async () => {
    if (!ASSET_MUTATIONS_ENABLED) { setError("Asset upload/activation is disabled until the exact backend contract is verified. No mutation request will be sent."); return; }
    if (!selectedSlot || !file) return;
    const changeReason = reason.trim();
    if (!changeReason) {
      setError("Asset upload cancelled: an audit reason is required.");
      return;
    }
    if (changeReason.length > 500) {
      setError("Audit reason must be 500 characters or fewer.");
      return;
    }
    if (file.size <= 0) {
      setError("Choose a non-empty image file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Asset must be 1.25 MB or smaller for the Admin Web upload API.");
      return;
    }
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedMimeTypes.has(file.type.toLowerCase())) {
      setError("Unsupported image format. Choose a JPEG, PNG, or WebP file.");
      return;
    }
    try {
      if (!(await matchesImageSignature(file))) {
        setError("The file contents do not match its declared image format. Choose a valid JPEG, PNG, or WebP image.");
        return;
      }
    } catch {
      setError("Unable to inspect the image file. Choose a valid JPEG, PNG, or WebP image.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const size = dimensions ?? await readImageSize(file);
      const expected = selectedSlot[5].replaceAll("×", "x").split("x").map(Number);
      if (
        expected.length === 2 &&
        Number.isFinite(expected[0]) &&
        Number.isFinite(expected[1]) &&
        (size.width < expected[0] * 0.5 || size.height < expected[1] * 0.5)
      ) {
        throw new Error(`Image is smaller than the recommended minimum of ${selectedSlot[5]}.`);
      }

      const dataUrl = await dataUrlFromFile(file);
      const current = grouped.get(slotKey(selectedSlot));
      if (current) {
        await request(`${RIDEX_API.admin.assets}/${encodeURIComponent(current.id)}/versions`, {
          method: "POST",
          body: JSON.stringify({
            file: { fileName: file.name, mimeType: file.type, base64: dataUrl },
            changeReason,
          }),
        });
        await request(`${RIDEX_API.admin.assets}/${encodeURIComponent(current.id)}/activate`, {
          method: "POST",
          body: JSON.stringify({
            version: Number(current.currentVersion) + 1,
            changeReason,
          }),
        });
      } else {
        await request(RIDEX_API.admin.assets, {
          method: "POST",
          body: JSON.stringify({
            appTarget: selectedSlot[0],
            screenKey: selectedSlot[1],
            placementKey: selectedSlot[2],
            sectionKey: selectedSlot[3],
            assetKey: `${selectedSlot[0].toLowerCase()}_${selectedSlot[1].toLowerCase()}_${selectedSlot[2].toLowerCase()}`,
            name: selectedSlot[4],
            file: { fileName: file.name, mimeType: file.type, base64: dataUrl },
            changeReason,
          }),
        });
      }

      setMessage(`${selectedSlot[4]} saved and activated for ${selectedSlot[0]} delivery.`);
      await chooseFile(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save asset");
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (asset: Asset) => {
    if (!asset.currentVersion || asset.currentVersion <= 1) {
      setError("No previous asset version is available for rollback.");
      return;
    }
    const version = window.prompt(`Rollback ${asset.name} to version (1-${asset.currentVersion - 1})`, String(asset.currentVersion - 1));
    if (version === null) return;
    const selectedVersion = Number(version);
    if (!Number.isInteger(selectedVersion) || selectedVersion < 1 || selectedVersion >= asset.currentVersion) {
      setError("Enter a valid previous asset version.");
      return;
    }
    const changeReason = window.prompt(`Reason for rolling back ${asset.name} to version ${selectedVersion}`)?.trim();
    if (!changeReason) {
      setError("Asset rollback cancelled: an audit reason is required.");
      return;
    }
    if (changeReason.length > 500) {
      setError("Audit reason must be 500 characters or fewer.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(`${RIDEX_API.admin.assets}/${encodeURIComponent(asset.id)}/rollback`, {
        method: "POST",
        body: JSON.stringify({ version: selectedVersion, changeReason }),
      });
      setMessage(`${asset.name} rolled back to version ${selectedVersion}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to rollback asset");
    } finally {
      setBusy(false);
    }
  };

  const activeUrl = selectedAsset?.current?.downloadUrl || "";

  return (
    <div className="rx-asset-manager">
      <div className="rx-asset-manager-head">
        <div>
          <strong>Live Asset Manager</strong>
          <span>Admin-managed media is delivered through the Backend asset contract; Customer, Driver and Shared targets keep their bundled default fallback.</span>
        </div>
        <div className="rx-asset-manager-head-actions">
          <select value={target} onChange={(e) => setTarget(e.target.value as Target)} aria-label="Asset audience">
            <option value="ALL">All audiences</option>
            <option value="CUSTOMER">Customer</option>
            <option value="DRIVER">Driver</option>
            <option value="SHARED">Shared</option>
          </select>
          <button className="rx-btn secondary" onClick={() => void refresh()} disabled={loading || busy}>Refresh</button>
        </div>
      </div>

      {error && <div className="rx-notice danger" role="alert">{error}</div>}
      {error && catalogueLoadError && hasLoaded && <div className="rx-notice warning" role="status">The last successful asset catalogue is retained and may be stale.</div>}
      {!ASSET_MUTATIONS_ENABLED && <div className="rx-notice warning" role="status">Read-only contract gate: upload, activation, and rollback are disabled until backend asset mutation routes and permission requirements are verified.</div>}
      {message && <div className="rx-notice success" role="status">{message}</div>}

      {!loading && error && catalogueLoadError && !hasLoaded ? <div className="rx-notice warning" role="status"><strong>Asset catalogue unavailable.</strong> The request failed before a catalogue was loaded; default app assets should not be interpreted as proof that no custom asset is configured.</div> : null}
      <div className="rx-asset-grid">
        {visibleSlots.map((slot) => {
          const key = slotKey(slot);
          const asset = grouped.get(key);
          return (
            <button key={key} className={`rx-asset-manager-card ${selected === key ? "selected" : ""}`} onClick={() => chooseSlot(slot)}>
              <div className="rx-asset-manager-icon"><UploadCloud size={18} /></div>
              <div>
                <strong>{slot[4]}</strong>
                <small>{slot[0]} · {slot[1]} · {slot[2]}</small>
                <small>Recommended {slot[5]} · {slot[6]}</small>
                {asset ? (
                  <small className={asset.active ? "live" : ""}>Version {asset.currentVersion} · {asset.active ? "Active" : "Inactive"} · {asset.scopeType || "GLOBAL"}</small>
                ) : (
                  <small>No custom asset · app default remains available</small>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedSlot && (
        <div className="rx-asset-delivery-card">
          <div className="rx-asset-delivery-preview">
            <div className="rx-asset-delivery-placeholder"><Eye size={20} /><strong>{activeUrl ? "Custom asset is active" : "No custom active asset"}</strong><span>{activeUrl ? `Preview disabled. ${selectedAsset?.current?.fileName || "A custom asset is configured."}` : "The app will use the bundled RideX default."}</span></div>
          </div>
          <div className="rx-asset-delivery-meta">
            <div><strong>{selectedSlot[4]}</strong><span>{selectedSlot[0]} delivery · {selectedSlot[1]} / {selectedSlot[2]}</span></div>
            {selectedAsset ? (
              <>
                <div className="rx-asset-delivery-facts">
                  <span>Active version <b>{selectedAsset.currentVersion}</b></span>
                  <span>Status <b>{selectedAsset.active ? "ACTIVE" : "INACTIVE"}</b></span>
                  <span>Scope <b>{selectedAsset.scopeType || "GLOBAL"}</b></span>
                  {selectedAsset.current?.fileName ? <span>File <b>{selectedAsset.current.fileName}</b></span> : null}
                </div>
                <div className="rx-asset-delivery-actions">
                  {selectedAsset.current?.downloadUrl ? <a className="rx-btn secondary" href={selectedAsset.current.downloadUrl} target="_blank" rel="noreferrer">Open Active Asset</a> : null}
                  <button className="rx-btn secondary" onClick={() => void rollback(selectedAsset)} disabled={!ASSET_MUTATIONS_ENABLED || busy || selectedAsset.currentVersion <= 1}><RotateCcw size={15} /> Rollback</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      <div className="rx-asset-upload-row">
        <label className="rx-file-input" aria-label="Choose RideX asset image">
          <span>{file ? file.name : "Choose JPG / PNG / WebP"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} />
        </label>
        {file ? <div className="rx-asset-selected-preview-text" role="status"><Eye size={15} /><span>Image preview disabled · {file.name}</span></div> : null}
        {dimensions ? <span className="rx-asset-dimensions">{dimensions.width}×{dimensions.height}px</span> : null}
        <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} maxLength={500} placeholder="Required audit reason for upload / activation" />
        <button className="rx-btn primary" disabled={!ASSET_MUTATIONS_ENABLED || !selectedSlot || !file || busy} onClick={() => void upload()}>{busy ? "Saving…" : "Save & Activate"}</button>
      </div>

      <div className="rx-asset-help">
        <History size={15} /><span>Each upload becomes a version; activation is server-side and audited.</span>
        <RotateCcw size={15} /><span>Previous versions remain rollback candidates.</span>
        <CheckCircle2 size={15} /><span>Active media is exposed through the backend delivery contract; if no custom media is active, the app keeps the bundled default.</span>
      </div>
    </div>
  );
}
