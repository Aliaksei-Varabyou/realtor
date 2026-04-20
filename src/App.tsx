import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";

type MeetingType = "mortgage" | "consultation";
type City = "wroclaw" | "warsaw" | "other";

type BookingFormData = {
  fullName: string;
  phone: string;
  email: string;
  meetingType: "" | MeetingType;
  city: "" | City;
  date: string;
  meetingDateTime: string;
  telegramUsername: string;
  instagramUrl: string;
};

type AdminCalendar = { id: string; summary: string };
type AdminBooking = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  meetingType: string;
  city: string;
  datetime: string;
  contact: string;
  calendarsUsed: string;
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      // Keep fallback message for non-JSON errors.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function BookingPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<BookingFormData>({
    fullName: "",
    phone: "",
    email: "",
    meetingType: "",
    city: "",
    date: today,
    meetingDateTime: "",
    telegramUsername: "",
    instagramUrl: "",
  });
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canLoadSlots = Boolean(form.meetingType && form.city && form.date);

  useEffect(() => {
    if (!canLoadSlots) {
      setAvailableSlots([]);
      setForm((prev) => ({ ...prev, meetingDateTime: "" }));
      return;
    }

    const loadSlots = async () => {
      setLoadingSlots(true);
      setError("");
      try {
        const data = await apiRequest<{ availableSlots: string[] }>("/api/bookings/availability", {
          method: "POST",
          body: JSON.stringify({
            meetingType: form.meetingType,
            city: form.city,
            date: form.date,
          }),
        });
        setAvailableSlots(data.availableSlots);
        if (!data.availableSlots.includes(form.meetingDateTime)) {
          setForm((prev) => ({ ...prev, meetingDateTime: "" }));
        }
      } catch (e) {
        setAvailableSlots([]);
        setError(e instanceof Error ? e.message : "Unable to load slots");
      } finally {
        setLoadingSlots(false);
      }
    };

    void loadSlots();
  }, [canLoadSlots, form.city, form.date, form.meetingType]);

  const groupedSlots = useMemo(
    () =>
      availableSlots.map((slot) => ({
        iso: slot,
        label: new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Warsaw",
        }).format(new Date(slot)),
      })),
    [availableSlots],
  );

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.meetingDateTime) {
      setError("Please select a time slot");
      return;
    }
    if (!form.telegramUsername.trim() && !form.instagramUrl.trim()) {
      setError("Provide telegram username or instagram URL");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<{ message: string }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          meetingType: form.meetingType,
          city: form.city,
          meetingDateTime: form.meetingDateTime,
          telegramUsername: form.telegramUsername,
          instagramUrl: form.instagramUrl,
        }),
      });
      setSuccess("Booking confirmed. We have added it to our calendars.");
      setForm((prev) => ({
        ...prev,
        fullName: "",
        phone: "",
        email: "",
        meetingDateTime: "",
        telegramUsername: "",
        instagramUrl: "",
      }));
      setAvailableSlots((prev) => prev.filter((item) => item !== form.meetingDateTime));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create booking");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <header className="header">
        <h1>Realtor Booking</h1>
        <p>Schedule mortgage and consultation meetings in Europe/Warsaw timezone.</p>
        <Link to="/admin" className="textLink">
          Admin panel
        </Link>
      </header>

      <form className="card formGrid" onSubmit={submitBooking}>
        <label>
          Full name *
          <input
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder="John Smith"
            required
          />
        </label>

        <label>
          Phone *
          <input
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            required
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </label>

        <label>
          Meeting type *
          <select
            value={form.meetingType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                meetingType: e.target.value as BookingFormData["meetingType"],
              }))
            }
            required
          >
            <option value="">Select...</option>
            <option value="mortgage">mortgage</option>
            <option value="consultation">consultation</option>
          </select>
        </label>

        <label>
          City *
          <select
            value={form.city}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, city: e.target.value as BookingFormData["city"] }))
            }
            required
          >
            <option value="">Select...</option>
            <option value="wroclaw">wroclaw</option>
            <option value="warsaw">warsaw</option>
            <option value="other">other</option>
          </select>
        </label>

        <label>
          Date *
          <input
            type="date"
            value={form.date}
            min={today}
            onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
            disabled={!form.meetingType || !form.city}
          />
        </label>

        <fieldset className="slotSection" disabled={!form.meetingType || !form.city}>
          <legend>Meeting time *</legend>
          {loadingSlots && <p className="hint">Loading available slots...</p>}
          {!loadingSlots && canLoadSlots && groupedSlots.length === 0 && (
            <p className="hint">No available slots for this day.</p>
          )}
          <div className="slots">
            {groupedSlots.map((slot) => (
              <button
                key={slot.iso}
                type="button"
                className={slot.iso === form.meetingDateTime ? "slotButton active" : "slotButton"}
                onClick={() => setForm((prev) => ({ ...prev, meetingDateTime: slot.iso }))}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </fieldset>

        {form.meetingDateTime && (
          <>
            <label>
              Telegram username
              <input
                value={form.telegramUsername}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, telegramUsername: e.target.value }))
                }
                placeholder="@yourname"
              />
            </label>
            <label>
              Instagram URL
              <input
                value={form.instagramUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                placeholder="https://instagram.com/..."
              />
            </label>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}

        <button type="submit" disabled={submitting || !form.meetingDateTime}>
          {submitting ? "Booking..." : "Book meeting"}
        </button>
      </form>
    </main>
  );
}

function AdminPage() {
  const location = useLocation();
  const [token, setToken] = useState(localStorage.getItem("adminToken") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(location.search.includes("google=connected") ? "Google connected." : "");
  const [availableCalendars, setAvailableCalendars] = useState<AdminCalendar[]>([]);
  const [assigned, setAssigned] = useState({
    calendar1: "",
    calendar2: "",
    calendar3: "",
  });
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(false);

  const authorizedRequest = async <T,>(path: string, init?: RequestInit) =>
    apiRequest<T>(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

  const loadAdminData = async () => {
    setLoading(true);
    setError("");
    try {
      const [calendarData, bookingData] = await Promise.all([
        authorizedRequest<{
          availableCalendars: AdminCalendar[];
          assigned: { calendar1: string; calendar2: string; calendar3: string };
        }>("/api/admin/calendars"),
        authorizedRequest<{ bookings: AdminBooking[] }>("/api/admin/bookings"),
      ]);

      setAvailableCalendars(calendarData.availableCalendars);
      setAssigned(calendarData.assigned);
      setBookings(bookingData.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void loadAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      const data = await apiRequest<{ token: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      localStorage.setItem("adminToken", data.token);
      setToken(data.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  };

  const connectGoogle = async () => {
    setError("");
    try {
      const data = await authorizedRequest<{ url: string }>("/api/admin/google/auth-url");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google connect failed");
    }
  };

  const saveAssignments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    try {
      await authorizedRequest<{ message: string }>("/api/admin/calendars", {
        method: "PUT",
        body: JSON.stringify(assigned),
      });
      setStatus("Calendar assignments saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (!token) {
    return (
      <main className="page">
        <header className="header">
          <h1>Admin Login</h1>
          <Link to="/" className="textLink">
            Back to booking form
          </Link>
        </header>
        <form className="card" onSubmit={login}>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Login</button>
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Admin Panel</h1>
        <div className="row">
          <Link to="/" className="textLink">
            Back to booking form
          </Link>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("adminToken");
              setToken("");
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <section className="card">
        <h2>Google Calendar Connection</h2>
        <button type="button" onClick={connectGoogle}>
          Connect Google Calendars
        </button>
      </section>

      <form className="card formGrid" onSubmit={saveAssignments}>
        <h2>Calendar Assignment</h2>
        {(["calendar1", "calendar2", "calendar3"] as const).map((slot) => (
          <label key={slot}>
            {slot}
            <select
              value={assigned[slot]}
              onChange={(e) =>
                setAssigned((prev) => ({
                  ...prev,
                  [slot]: e.target.value,
                }))
              }
              required
            >
              <option value="">Select calendar</option>
              {availableCalendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit">Save assignments</button>
      </form>

      <section className="card">
        <h2>Upcoming bookings</h2>
        {loading && <p className="hint">Loading data...</p>}
        {!loading && bookings.length === 0 && <p className="hint">No upcoming bookings.</p>}
        {!loading && bookings.length > 0 && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>City</th>
                  <th>Phone</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{new Date(booking.datetime).toLocaleString("en-GB")}</td>
                    <td>{booking.fullName}</td>
                    <td>{booking.meetingType}</td>
                    <td>{booking.city}</td>
                    <td>{booking.phone}</td>
                    <td>{booking.contact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      {status && <p className="success">{status}</p>}
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
