from __future__ import annotations

import json
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://service-writer-final.vercel.app"
ROUTES = [
    "/", "/how-it-works", "/features-guide", "/pricing", "/find-provider", "/faqs",
    "/contact", "/about", "/advertising-network", "/partner-program", "/white-glove-onboarding",
    "/blog", "/blog/all-features-showcase", "/insights", "/careers", "/support", "/knowledge-base",
    "/privacy-policy", "/terms", "/security", "/login", "/login/business", "/login/dispatch",
    "/login/technician", "/login/magic-link", "/admin/login", "/signup", "/forgot-password",
]

results = []
for route in ROUTES:
    url = f"{BASE}{route}"
    try:
        response = requests.get(url, timeout=20)
        soup = BeautifulSoup(response.text, "html.parser")
        results.append({
            "route": route,
            "status": response.status_code,
            "title": soup.title.get_text(" ", strip=True) if soup.title else "",
            "h1": [x.get_text(" ", strip=True) for x in soup.find_all("h1")[:3]],
            "h2": [x.get_text(" ", strip=True) for x in soup.find_all("h2")[:5]],
            "final_url": response.url,
        })
    except Exception as exc:
        results.append({"route": route, "status": None, "error": f"{type(exc).__name__}: {exc}"})

Path("/home/ubuntu/ServiceWriterFinal/public-route-inspection.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
