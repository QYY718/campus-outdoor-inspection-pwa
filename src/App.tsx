import React, { useEffect, useState } from "react";
import "./styles.css";
import { getPhoto, savePhoto, deletePhoto } from "./db";

type ReportStatus = "Pending" | "In Progress" | "Resolved";
type UserRole = "student" | "admin" | null;
type TabType = "home" | "reports" | "profile";

type ReportLocation = {
  latitude: number | null;
  longitude: number | null;
  locationError: string;
  mapUrl: string;
};

type Report = {
  id: number;
  title: string;
  category: string;
  description: string;
  status: ReportStatus;
  createdAt: string;
  location: ReportLocation;
  hasPhoto: boolean;
  photo?: string;
  createdBy: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const emptyLocation: ReportLocation = {
  latitude: null,
  longitude: null,
  locationError: "",
  mapUrl: "",
};

const ADMIN_PASSWORD = "admin123";

function normalizePassword(value: string): string {
  return value
    .trim()
    .replace(/\u3000/g, " ")
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 65248)
    );
}

function ReportPhoto({ report }: { report: Report }) {
  const [photoUrl, setPhotoUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    let objectUrlToRevoke: string | null = null;

    async function loadPhoto() {
      if (report.photo) {
        setPhotoUrl(report.photo);
        return;
      }

      if (!report.hasPhoto) {
        setPhotoUrl("");
        return;
      }

      const url = await getPhoto(report.id);

      if (!active) return;

      if (url) {
        objectUrlToRevoke = url;
        setPhotoUrl(url);
      } else {
        setPhotoUrl("");
      }
    }

    loadPhoto();

    return () => {
      active = false;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [report.id, report.hasPhoto, report.photo]);

  if (!photoUrl) return null;

  return (
    <div className="report-photo-box">
      <img src={photoUrl} alt={report.title} className="report-photo" />
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState<UserRole>(null);
  const [username, setUsername] = useState<string>("");
  const [adminPassword, setAdminPassword] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabType>("home");

  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("Lighting");
  const [description, setDescription] = useState<string>("");
  const [status, setStatus] = useState<ReportStatus>("Pending");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [existingHasPhoto, setExistingHasPhoto] = useState<boolean>(false);
  const [removeExistingPhoto, setRemoveExistingPhoto] =
    useState<boolean>(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  const [reports, setReports] = useState<Report[]>(() => {
    const savedReports = localStorage.getItem("reports");
    if (!savedReports) return [];

    try {
      const parsedReports = JSON.parse(savedReports);

      return parsedReports.map((report: Partial<Report>) => ({
        id: report.id ?? Date.now(),
        title: report.title ?? "",
        category: report.category ?? "Other",
        description: report.description ?? "",
        status: (report.status as ReportStatus) ?? "Pending",
        createdAt: report.createdAt ?? new Date().toLocaleString(),
        location: report.location ?? {
          latitude: null,
          longitude: null,
          locationError: "",
          mapUrl: "",
        },
        hasPhoto: report.hasPhoto ?? Boolean(report.photo),
        photo: report.photo ?? "",
        createdBy: report.createdBy ?? "Unknown",
      }));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const savedRole = localStorage.getItem("userRole") as UserRole;
    const savedUser = localStorage.getItem("currentUser") || "";

    if (savedRole) setRole(savedRole);
    if (savedUser) setCurrentUser(savedUser);
  }, []);

  useEffect(() => {
    localStorage.setItem("reports", JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    const updateNetworkStatus = () => {
      setIsOnline(navigator.onLine);
    };

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    updateNetworkStatus();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", updateNetworkStatus);
    document.addEventListener("visibilitychange", updateNetworkStatus);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", updateNetworkStatus);
      document.removeEventListener("visibilitychange", updateNetworkStatus);
    };
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!installPromptEvent) return;

    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;

    if (choice.outcome === "accepted") {
      setInstallPromptEvent(null);
    }
  }

  function handleStudentLogin() {
    const cleanUsername = username.trim();

    if (!cleanUsername) {
      alert("Please enter your name.");
      return;
    }

    setRole("student");
    setCurrentUser(cleanUsername);
    localStorage.setItem("userRole", "student");
    localStorage.setItem("currentUser", cleanUsername);
    setAdminPassword("");
  }

  function handleAdminLogin() {
    const cleanUsername = username.trim();
    const cleanPassword = normalizePassword(adminPassword);
    const expectedPassword = normalizePassword(ADMIN_PASSWORD);

    if (!cleanUsername) {
      alert("Please enter admin name.");
      return;
    }

    if (!cleanPassword) {
      alert("Please enter admin password.");
      return;
    }

    if (cleanPassword !== expectedPassword) {
      alert("Incorrect admin password.");
      return;
    }

    setRole("admin");
    setCurrentUser(cleanUsername);
    localStorage.setItem("userRole", "admin");
    localStorage.setItem("currentUser", cleanUsername);
    setAdminPassword("");
  }

  function handleLogout() {
    setRole(null);
    setCurrentUser("");
    setUsername("");
    setAdminPassword("");
    setEditingId(null);
    localStorage.removeItem("userRole");
    localStorage.removeItem("currentUser");
  }

  function updateReportLocation(id: number, location: ReportLocation) {
    setReports((currentReports) =>
      currentReports.map((report) =>
        report.id === id ? { ...report, location } : report
      )
    );
  }

  function getCurrentLocation(id: number) {
    if (!navigator.geolocation) {
      updateReportLocation(id, {
        latitude: null,
        longitude: null,
        locationError: "Geolocation is not supported by this browser.",
        mapUrl: "",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        updateReportLocation(id, {
          latitude,
          longitude,
          locationError: "",
          mapUrl: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`,
        });
      },
      () => {
        updateReportLocation(id, {
          latitude: null,
          longitude: null,
          locationError: "Unable to retrieve location.",
          mapUrl: "",
        });
      }
    );
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    setRemoveExistingPhoto(false);

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setPhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      alert("Please enter both title and description.");
      return;
    }

    if (!currentUser) {
      alert("Please log in first.");
      return;
    }

    if (editingId !== null) {
      const targetReport = reports.find((r) => r.id === editingId);
      if (!targetReport) return;

      if (role === "student" && targetReport.createdBy !== currentUser) {
        alert("Students can only edit their own reports.");
        return;
      }

      const finalHasPhoto = removeExistingPhoto
        ? Boolean(photoFile)
        : photoFile
        ? true
        : existingHasPhoto;

      const updatedReports = reports.map((report) =>
        report.id === editingId
          ? {
              ...report,
              title: title.trim(),
              category,
              description: description.trim(),
              status: role === "admin" ? status : report.status,
              hasPhoto: finalHasPhoto,
              photo: "",
            }
          : report
      );

      setReports(updatedReports);

      if (removeExistingPhoto && !photoFile) {
        await deletePhoto(editingId);
      }

      if (photoFile) {
        await savePhoto(editingId, photoFile);
      }

      resetForm();
    } else {
      const newId = Date.now();

      const newReport: Report = {
        id: newId,
        title: title.trim(),
        category,
        description: description.trim(),
        status: "Pending",
        createdAt: new Date().toLocaleString(),
        location: emptyLocation,
        hasPhoto: Boolean(photoFile),
        photo: "",
        createdBy: currentUser,
      };

      setReports((currentReports) => [newReport, ...currentReports]);

      if (photoFile) {
        await savePhoto(newId, photoFile);
      }

      getCurrentLocation(newId);
      resetForm();
    }
  }

  async function deleteReport(id: number) {
    const targetReport = reports.find((report) => report.id === id);
    if (!targetReport) return;

    if (role === "student" && targetReport.createdBy !== currentUser) {
      alert("Students can only delete their own reports.");
      return;
    }

    const updatedReports = reports.filter((report) => report.id !== id);
    setReports(updatedReports);

    await deletePhoto(id);

    if (editingId === id) {
      resetForm();
    }
  }

  async function startEdit(report: Report) {
    if (role === "student" && report.createdBy !== currentUser) {
      alert("Students can only edit their own reports.");
      return;
    }

    setActiveTab("home");
    setTitle(report.title);
    setCategory(report.category);
    setDescription(report.description);
    setStatus(report.status);
    setEditingId(report.id);
    setExistingHasPhoto(report.hasPhoto);
    setRemoveExistingPhoto(false);
    setPhotoFile(null);

    if (report.photo) {
      setPhotoPreview(report.photo);
      return;
    }

    if (report.hasPhoto) {
      const url = await getPhoto(report.id);
      setPhotoPreview(url ?? "");
    } else {
      setPhotoPreview("");
    }
  }

  function resetForm() {
    setTitle("");
    setCategory("Lighting");
    setDescription("");
    setStatus("Pending");
    setPhotoFile(null);
    setPhotoPreview("");
    setExistingHasPhoto(false);
    setRemoveExistingPhoto(false);
    setEditingId(null);
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview("");
    setRemoveExistingPhoto(true);
  }

  function getStatusClass(statusValue: ReportStatus) {
    switch (statusValue) {
      case "Pending":
        return "status-badge status-pending";
      case "In Progress":
        return "status-badge status-progress";
      case "Resolved":
        return "status-badge status-resolved";
      default:
        return "status-badge";
    }
  }

  const visibleReports =
    role === "admin"
      ? reports
      : reports.filter((report) => report.createdBy === currentUser);

  const totalReports = visibleReports.length;
  const pendingCount = visibleReports.filter(
    (r) => r.status === "Pending"
  ).length;
  const progressCount = visibleReports.filter(
    (r) => r.status === "In Progress"
  ).length;
  const resolvedCount = visibleReports.filter(
    (r) => r.status === "Resolved"
  ).length;

  const backgroundStyle = {
    backgroundImage: `linear-gradient(rgba(22, 101, 52, 0.35), rgba(22, 101, 52, 0.35)), url(${process.env.PUBLIC_URL}/bg.jpg)`,
    backgroundSize: "cover" as const,
    backgroundPosition: "center" as const,
    backgroundRepeat: "no-repeat" as const,
    minHeight: "100vh",
  };

  if (!role) {
    return (
      <div className="login-screen-modern" style={backgroundStyle}>
        <div className="login-card-modern">
          <p className="eyebrow">Campus maintenance reporting</p>
          <h1 style={{ marginTop: 0 }}>Welcome Back</h1>
          <p className="subtitle" style={{ marginBottom: "1.2rem" }}>
            Select your role to enter the app prototype.
          </p>

          <div style={{ display: "grid", gap: "0.9rem" }}>
            <label>
              Your Name
              <input
                type="text"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: "0.45rem",
                  padding: "0.85rem 0.95rem",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                }}
              />
            </label>

            <button className="primary-btn" onClick={handleStudentLogin}>
              Continue as Student
            </button>

            <div
              style={{
                borderTop: "1px solid #e2e8f0",
                paddingTop: "0.9rem",
                display: "grid",
                gap: "0.75rem",
              }}
            >
              <label>
                Admin Password
                <input
                  type="password"
                  placeholder="Enter admin password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoComplete="off"
                  inputMode="numeric"
                  style={{
                    width: "100%",
                    marginTop: "0.45rem",
                    padding: "0.85rem 0.95rem",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                  }}
                />
              </label>

              <button className="secondary-btn" onClick={handleAdminLogin}>
                Continue as Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={backgroundStyle}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-status-row">
            <div
              className={`network-status ${isOnline ? "online" : "offline"}`}
            >
              {isOnline
                ? "🟢 Online"
                : "🟡 Offline – reports will be saved locally"}
            </div>

            {installPromptEvent && !isInstalled && (
              <button className="install-btn" onClick={handleInstallClick}>
                Install App
              </button>
            )}

            {isInstalled && (
              <div className="installed-badge">App Installed</div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p className="eyebrow">Campus maintenance reporting</p>
              <h1>Campus Outdoor Inspection App</h1>
              <p className="subtitle">
                A simple mobile-friendly app for reporting outdoor maintenance
                and safety issues on campus.
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {currentUser} ({role})
              </p>
              <button
                className="secondary-btn"
                onClick={handleLogout}
                style={{ marginTop: "0.6rem" }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="page">
        {activeTab === "home" && (
          <section className="form-panel">
            <div className="panel-header">
              <h2>{editingId !== null ? "Edit Report" : "New Report"}</h2>
              <p>
                {editingId !== null
                  ? "Update the selected report details below."
                  : "Create a new inspection or maintenance report."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="report-form">
              <label>
                Report Title
                <input
                  type="text"
                  placeholder="e.g. Broken street light near library"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Lighting">Lighting</option>
                  <option value="Waste">Waste</option>
                  <option value="Surface Damage">Surface Damage</option>
                  <option value="Signage">Signage</option>
                  <option value="Safety Hazard">Safety Hazard</option>
                  <option value="Furniture">Furniture</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label>
                Description
                <textarea
                  rows={5}
                  placeholder="Describe the issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              {role === "admin" && (
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ReportStatus)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </label>
              )}

              <label>
                Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                />
              </label>

              {photoPreview && (
                <div className="photo-preview-box">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="photo-preview"
                  />
                  <button
                    type="button"
                    className="secondary-btn remove-photo-btn"
                    onClick={removePhoto}
                  >
                    Remove Photo
                  </button>
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="primary-btn">
                  {editingId !== null ? "Update Report" : "Add Report"}
                </button>

                {editingId !== null && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        <section className="content-panel">
          {activeTab !== "profile" && (
            <div className="stats-grid">
              <article className="stat-card">
                <span className="stat-label">Total Reports</span>
                <strong className="stat-value">{totalReports}</strong>
              </article>

              <article className="stat-card">
                <span className="stat-label">Pending</span>
                <strong className="stat-value">{pendingCount}</strong>
              </article>

              <article className="stat-card">
                <span className="stat-label">In Progress</span>
                <strong className="stat-value">{progressCount}</strong>
              </article>

              <article className="stat-card">
                <span className="stat-label">Resolved</span>
                <strong className="stat-value">{resolvedCount}</strong>
              </article>
            </div>
          )}

          {(activeTab === "reports" || activeTab === "home") && (
            <section className="list-panel">
              <div className="panel-header list-header">
                <div>
                  <h2>{role === "admin" ? "All Reports" : "My Reports"}</h2>
                  <p>
                    {role === "admin"
                      ? "Review and manage all submitted inspection reports."
                      : "Review and manage your submitted reports."}
                  </p>
                </div>
              </div>

              {visibleReports.length === 0 ? (
                <p className="empty-state">
                  No reports yet. Add your first report using the form.
                </p>
              ) : (
                <div className="report-list">
                  {visibleReports.map((report) => (
                    <article key={report.id} className="report-card">
                      <div className="report-top">
                        <div className="report-title-wrap">
                          <h3>{report.title}</h3>
                          <p className="report-time">{report.createdAt}</p>
                        </div>

                        <span className={getStatusClass(report.status)}>
                          {report.status}
                        </span>
                      </div>

                      <div className="report-meta">
                        <span className="meta-chip">{report.category}</span>
                        <span
                          className="meta-chip"
                          style={{
                            marginLeft: "0.5rem",
                            background: "#dcfce7",
                            color: "#166534",
                          }}
                        >
                          By {report.createdBy}
                        </span>
                      </div>

                      <p className="report-description">{report.description}</p>

                      <ReportPhoto report={report} />

                      <div className="location-block">
                        <p className="location-title">Location</p>

                        {report.location?.latitude !== null &&
                        report.location?.latitude !== undefined &&
                        report.location?.longitude !== null &&
                        report.location?.longitude !== undefined ? (
                          <>
                            <p className="location-text">
                              Latitude: {report.location.latitude.toFixed(5)}
                            </p>
                            <p className="location-text">
                              Longitude: {report.location.longitude.toFixed(5)}
                            </p>
                            <a
                              className="map-link"
                              href={report.location.mapUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in map
                            </a>
                          </>
                        ) : report.location?.locationError ? (
                          <p className="location-error">
                            {report.location.locationError}
                          </p>
                        ) : (
                          <p className="location-text">
                            Getting current location...
                          </p>
                        )}
                      </div>

                      <div className="card-actions">
                        <button
                          className="edit-btn"
                          onClick={() => startEdit(report)}
                        >
                          Edit
                        </button>

                        <button
                          className="delete-btn"
                          onClick={() => deleteReport(report.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "profile" && (
            <section className="list-panel">
              <div className="panel-header">
                <h2>Profile</h2>
                <p>Current account information.</p>
              </div>

              <div className="empty-state">
                <p style={{ marginTop: 0 }}>
                  <strong>Name:</strong> {currentUser}
                </p>
                <p>
                  <strong>Role:</strong> {role}
                </p>
                <p style={{ marginBottom: 0 }}>
                  {role === "admin"
                    ? "You can view and update all reports."
                    : "You can create reports and edit only your own submissions."}
                </p>
              </div>
            </section>
          )}
        </section>
      </main>

      <nav
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          justifyContent: "space-around",
          gap: "0.5rem",
          background: "rgba(255,255,255,0.95)",
          borderTop: "1px solid #e2e8f0",
          padding: "0.8rem",
          backdropFilter: "blur(10px)",
        }}
      >
        <button
          className="secondary-btn"
          onClick={() => setActiveTab("home")}
          style={{
            flex: 1,
            background: activeTab === "home" ? "#dcfce7" : "#e2e8f0",
            color: activeTab === "home" ? "#166534" : "#334155",
          }}
        >
          Home
        </button>
        <button
          className="secondary-btn"
          onClick={() => setActiveTab("reports")}
          style={{
            flex: 1,
            background: activeTab === "reports" ? "#dcfce7" : "#e2e8f0",
            color: activeTab === "reports" ? "#166534" : "#334155",
          }}
        >
          Reports
        </button>
        <button
          className="secondary-btn"
          onClick={() => setActiveTab("profile")}
          style={{
            flex: 1,
            background: activeTab === "profile" ? "#dcfce7" : "#e2e8f0",
            color: activeTab === "profile" ? "#166534" : "#334155",
          }}
        >
          Profile
        </button>
      </nav>
    </div>
  );
}
