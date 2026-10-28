# WindIQ — Point-in-Time UK Wind Generation Forecast Platform

> **UK Day-Ahead Energy Market Decision Intelligence**  
> Built for wholesale electricity trading teams procuring reserve/thermal capacity without look-ahead bias.

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18_TypeScript-61DAFB.svg?style=flat&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Bundler-Vite_5-646CFF.svg?style=flat&logo=vite)](https://vitejs.dev/)
[![Docker](https://img.shields.io/badge/Container-Docker_Compose-2496ED.svg?style=flat&logo=docker)](https://www.docker.com/)
[![Elexon BMRS](https://img.shields.io/badge/Data-Elexon_BMRS_API-blue.svg)](https://bmrs.elexon.co.uk)

---

## 🌟 Executive Summary & Problem Setting

In the UK wholesale electricity market, day-ahead purchase decisions for delivery day $D$ must be submitted by noon on $D-1$ (the gate closure / day-ahead auction deadline). Because wind generation is intermittent and weather-dependent, energy suppliers must forecast wind yield accurately to determine how much supplementary thermal or balancing capacity (e.g., CCGT, peaker plants, batteries) to procure.

### The Pitfall: Look-Ahead Bias
Elexon BMRS publishes the **WINDFOR** forecast stream up to 8 times daily. Each forecast record has:
- `startTime`: Target 30-minute delivery period.
- `publishTime`: Timestamp when the forecast was generated and published by the ESO.
- `generation`: Predicted wind output in MW.

**Look-ahead bias** occurs when an analytics system or trading portal naively queries the *latest* forecast for a target period, inadvertently displaying numbers published *after* the decision cutoff time. In reality, a trader making a commitment at 12:00 on $D-1$ could not have seen forecasts published at 16:00 or 20:00 on $D-1$. 

**WindIQ enforces Point-in-Time (PIT) correctness**:
$$\text{Filter: } \text{publish\_time} \le \text{decision\_cutoff}$$
Every chart, calculation, and API endpoint guarantees strict temporal fidelity to what was available at decision time.

---

## 🚀 Live Demo & Repository

- **Frontend (Vercel)**: `https://windiq-uk-energy.vercel.app` *(placeholder / deployment URL)*
- **Backend (Railway/Render)**: `https://windiq-api-production.up.railway.app` *(placeholder / deployment URL)*
- **Anonymous Submission Repo**: `https://github.com/energy-challenge-submission/kjhwr`

> **Hosting Architecture Note**: The React frontend is deployed on **Vercel** for edge CDN distribution and ultra-low latency static delivery. The Python FastAPI backend is deployed on **Railway/Render** because serverless Python environments on Vercel impose cold starts, memory ceilings, and execution time limits unsuitable for streaming large Elexon BMRS datasets (15,000+ records) and managing persistent SQLite database volumes.

---

## 📸 Key Features & Views

### 1. View 1 — Decision View (⚡ Zero Look-Ahead Bias)
- **Point-in-Time Filtering**: Interactive ISO-8601 decision cutoff selector (`publishTime <= cutoff`).
- **Visual Vintage Verification**: Timeline chips display exact forecast publication vintages actively contributing to the curve.
- **Overlay Comparison**: Synchronized visual alignment between point-in-time forecasts and actual outturn (`FUELHH` WIND stream).
- **Interactive Metrics**: Real-time peak, trough, and vintage count statistics.

### 2. View 2 — Accuracy View (📊 Quantified Error & Buffer Sizing)
- **Statistical Rigour**: Calculates Mean Absolute Error (**MAE**), Root Mean Squared Error (**RMSE**), and Mean Bias ($E[\hat{y} - y]$).
- **Horizon Stratification**: Stratifies accuracy across 6-hour forecast horizons ($0-6\text{h}, 6-12\text{h}, \dots, 36\text{h}+$):
  $$\text{Horizon} = \text{delivery\_period} - \text{publish\_time}$$
- **Procurement Implications**: Translates forecast degradation directly into recommended thermal buffer capacity:
  $$\text{Procurement Buffer} \approx \text{MAE} + 0.5 \times (\text{RMSE} - \text{MAE})$$
  Ensures traders price in fat-tail forecast variance and correct for systematic under/over-forecasting bias.

---

## 🗂️ File & Directory Structure

```text
.
├── docker-compose.yml           # Unified orchestration for frontend & backend
├── README.md                    # System documentation and challenge defense
├── .gitignore                   # Multi-tier exclusion rules
│
├── backend/                     # Python 3.12+ FastAPI backend service
│   ├── Dockerfile               # Production container definition
│   ├── requirements.txt         # Production dependencies
│   ├── requirements-dev.txt     # Test dependencies (pytest, pytest-asyncio)
│   ├── pyproject.toml           # Pytest & coverage configuration
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # Application entrypoint & CORS middleware
│   │   ├── database.py          # aiosqlite connection pool & schema init
│   │   ├── elexon_client.py     # Elexon BMRS API client with fallback detection
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── ingest.py        # Concurrent FUELHH & WINDFOR data ingestion
│   │       ├── forecasts.py     # Point-in-time forecast endpoint
│   │       ├── actuals.py       # Fuel-type filtered actuals endpoint
│   │       └── accuracy.py      # MAE, RMSE, Bias & horizon stratification
│   └── tests/
│       ├── __init__.py
│       └── test_point_in_time.py # Exact boundary & look-ahead exclusion tests
│
└── frontend/                    # React 18 + TypeScript + Vite frontend
    ├── Dockerfile               # Multi-stage production build (Node -> Nginx)
    ├── nginx.conf               # Nginx reverse proxy & SPA fallback
    ├── package.json             # NPM dependencies & scripts
    ├── tsconfig.json            # Strict TypeScript configuration
    ├── vite.config.ts           # Bundler settings & dev proxy
    ├── index.html               # App shell
    └── src/
        ├── main.tsx             # Application bootstrap
        ├── App.tsx              # View router and aurora layout
        ├── vite-env.d.ts        # Ambient environment typings
        ├── styles/
        │   └── globals.css      # Dark energy design system & animations
        ├── api/
        │   └── client.ts        # Typed Axios client & contracts
        ├── components/
        │   ├── NavBar.tsx       # Glassmorphism header with status pulse
        │   ├── HeroSection.tsx  # Interactive landing pitch with animated turbines
        │   ├── WindTurbine.tsx  # Dynamic SVG animated turbine component
        │   ├── ParticleBackground.tsx # High-performance 60fps canvas particle wind
        │   └── Footer.tsx       # Compliance, metadata, and data sources
        └── views/
            ├── DecisionView.tsx # View 1: Point-in-time day-ahead decision cockpit
            └── AccuracyView.tsx # View 2: Horizon degradation & error stratification
```

---

## 🛠️ How to Run Locally

### Option A: Via Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd test
   ```

2. **Launch all containers**:
   ```bash
   docker-compose up --build
   ```

3. **Access services**:
   - **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   - **Backend API**: [http://localhost:8000](http://localhost:8000)
   - **Interactive OpenAPI Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Option B: Local Manual Development

#### Backend Setup
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Run test suite:
```bash
pytest -v
```

#### Frontend Setup
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔬 Deep-Dive: Point-in-Time Correctness

### Database Schema Design
We store each forecast vintage individually in SQLite:
```sql
CREATE TABLE wind_forecasts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_period TEXT NOT NULL,   -- Target half-hour UTC ISO
    publish_time    TEXT NOT NULL,   -- Generation timestamp UTC ISO
    generation_mw   REAL NOT NULL,
    UNIQUE(delivery_period, publish_time)
);

CREATE INDEX idx_forecasts_pit ON wind_forecasts(delivery_period, publish_time);
```

### The Point-in-Time Query
When a trader requests the market state at `cutoff`:
```sql
SELECT delivery_period, publish_time, generation_mw
FROM   wind_forecasts
WHERE  delivery_period >= :delivery_from
  AND  delivery_period <= :delivery_to
  AND  publish_time    <= :cutoff  -- Strict historical cutoff filter
ORDER BY delivery_period, publish_time;
```
Because ISO 8601 strings in UTC (`YYYY-MM-DDTHH:MM:SSZ`) sort **lexicographically identical to chronologically**, the comparison `publish_time <= cutoff` is exact and performs in sub-millisecond time across indexed rows.

---

## 📊 Data Source & Fallback Strategy

Data is streamed directly from official **Elexon BMRS** endpoints:
1. **Actuals (`FUELHH`)**: Filtered to `fuelType=WIND`. Key fields: `startTime`, `generation`.
2. **Forecasts (`WINDFOR`)**: Complete vintage set. Key fields: `startTime`, `publishTime`, `generation`.

**Temporal Window**:
- **Primary**: January 2026 (Winter peak wind & heating demand).
- **Automated Fallback**: If Elexon API feeds for January 2026 are delayed or unreachable, the ingestion engine systematically scans backwards across preceding calendar months, selects the latest contiguous 30-day window, flags `using_fallback = true` in API headers and state payloads, and visually alerts the trader in the UI.

---

## 🤖 AI Tools Disclosure

As explicitly permitted and required by the challenge instructions:
- **Claude / Gemini (Antigravity Agentic Assistant)**: Assisted with architectural design, async Elexon API streaming integration, SQL schema index optimisation, Recharts data transformation pipelines, and drafting test coverage scenarios. All mathematical calculations, point-in-time logic, and UI design systems were verified and validated against the Elexon BMRS technical specifications.
