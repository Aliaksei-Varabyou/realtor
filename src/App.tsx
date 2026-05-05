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

type CalendarRole = "calendar1" | "calendar2" | "calendar3";
type CalendarConnection = {
  role: CalendarRole;
  email: string;
  calendarId: string;
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = "Ошибка запроса";
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
        const params = new URLSearchParams({
          meetingType: form.meetingType,
          city: form.city,
          date: form.date,
        });
        const data = await apiRequest<{ availableSlots: string[] }>(
          `/api/availability?${params.toString()}`,
        );
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
      setError("Пожалуйста, выберите временной слот");
      return;
    }
    if (!form.telegramUsername.trim() && !form.instagramUrl.trim()) {
      setError("Укажите Telegram username или ссылку Instagram");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<{ success: true }>("/api/book", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          meetingType: form.meetingType,
          city: form.city,
          datetime: form.meetingDateTime,
          contact: {
            telegramUsername: form.telegramUsername,
            instagramUrl: form.instagramUrl,
          },
        }),
      });
      setSuccess("Бронирование подтверждено. Встреча добавлена в календарь.");
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
      setError(e instanceof Error ? e.message : "Не удалось создать бронирование");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page bookingPage">
      <section className="bookingPanel">
        <header className="brandHeader">
          <Link to="/" className="brand">
            <img className="brandLogo" src="/logo.svg" alt="Независимость Дом" />
          </Link>
          <Link to="/admin" className="textLink menuLink">
            меню
          </Link>
        </header>

        <div className="heroCopy">
          <h1>Запись на встречу</h1>
          <p>Запланируйте встречу по часовому поясу Europe/Warsaw.</p>
        </div>

        <form className="card formGrid bookingForm" onSubmit={submitBooking}>
        <label>
          ФИО *
          <input
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder="Иван Иванов"
            required
          />
        </label>

        <label>
          Телефон *
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
          Тип услуги *
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
            <option value="">Выберите...</option>
            <option value="mortgage">ипотечное кредитование/просчет кредитоспособности</option>
            <option value="consultation">консультация покупка/продажа</option>
          </select>
        </label>

        <label>
          Город *
          <select
            value={form.city}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, city: e.target.value as BookingFormData["city"] }))
            }
            required
          >
            <option value="">Выберите...</option>
            <option value="wroclaw">Вроцлав</option>
            <option value="warsaw">Варшава</option>
            <option value="other">Другой</option>
          </select>
        </label>

        <label>
          Дата *
          <input
            type="date"
            value={form.date}
            min={today}
            onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
            disabled={!form.meetingType || !form.city}
          />
        </label>

        <fieldset className="slotSection" disabled={!form.meetingType || !form.city}>
          <legend>Время встречи *</legend>
          {loadingSlots && <p className="hint">Загрузка доступных слотов...</p>}
          {!loadingSlots && canLoadSlots && groupedSlots.length === 0 && (
            <p className="hint">На выбранный день нет свободных слотов.</p>
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
                placeholder="@username"
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
          {submitting ? "Бронирование..." : "Забронировать встречу"}
        </button>
        </form>
      </section>
    </main>
  );
}

function AdminPage() {
  const location = useLocation();
  const [adminPassword, setAdminPassword] = useState(localStorage.getItem("adminPassword") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status] = useState(() => {
    const params = new URLSearchParams(location.search);
    const role = params.get("role");
    if (params.get("google") === "connected") {
      return role ? `${role} connected.` : "Google connected.";
    }
    if (params.get("google") === "error") {
      return "Не удалось подключить Google.";
    }
    return "";
  });
  const [connections, setConnections] = useState<{
    calendar1: CalendarConnection | null;
    calendar2: CalendarConnection | null;
    calendar3: CalendarConnection | null;
  }>({
    calendar1: null,
    calendar2: null,
    calendar3: null,
  });
  const [loading, setLoading] = useState(false);

  const authorizedRequest = async <T,>(path: string, init?: RequestInit) =>
    apiRequest<T>(path, {
      ...init,
      headers: {
        "x-admin-password": adminPassword,
        ...(init?.headers ?? {}),
      },
    });

  const loadAdminData = async () => {
    setLoading(true);
    setError("");
    try {
      const calendarData = await authorizedRequest<{
        connections: {
          calendar1: CalendarConnection | null;
          calendar2: CalendarConnection | null;
          calendar3: CalendarConnection | null;
        };
      }>("/api/admin-calendars");

      setConnections(calendarData.connections);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные админки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminPassword) {
      void loadAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPassword]);

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!password.trim()) {
      setError("Введите пароль");
      return;
    }
    localStorage.setItem("adminPassword", password);
    setAdminPassword(password);
  };

  const connectGoogle = (role: CalendarRole) => {
    const params = new URLSearchParams({
      role,
      adminPassword,
    });
    window.location.href = `/api/auth?${params.toString()}`;
  };

  if (!adminPassword) {
    return (
      <main className="page adminPage">
        <header className="header">
          <h1>Admin Login</h1>
          <Link to="/" className="textLink">
            Назад к форме бронирования
          </Link>
        </header>
        <form className="card" onSubmit={login}>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Войти</button>
        </form>
      </main>
    );
  }

  return (
    <main className="page adminPage">
      <header className="header">
        <h1>Admin Panel</h1>
        <div className="row">
          <Link to="/" className="textLink">
            Назад к форме бронирования
          </Link>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("adminPassword");
              setAdminPassword("");
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      <section className="card">
        <h2>Подключения Google Календарей</h2>
        {(["calendar1", "calendar2", "calendar3"] as const).map((role) => {
          const connection = connections[role];
          return (
            <div key={role} className="row">
              <div>
                <strong>{role}</strong>:{" "}
                {connection ? `подключен (${connection.email})` : "не подключен"}
              </div>
              <button type="button" onClick={() => connectGoogle(role)}>
                {connection ? `Переподключить ${role}` : `Подключить ${role}`}
              </button>
            </div>
          );
        })}
      </section>

      {loading && <p className="hint">Загрузка подключений...</p>}
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
