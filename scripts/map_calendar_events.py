from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path('/home/ubuntu/ServiceWriterFinal/data/moms-mobile-oil-change')
OUT = ROOT / 'calendar-mapping-review'
OUT.mkdir(parents=True, exist_ok=True)
SPACE = re.compile(r'\s+')
NON_DIGIT = re.compile(r'\D+')
EMAIL = re.compile(r'[^\s<>;,]+@[^\s<>;,]+\.[^\s<>;,]+')


def norm(v: Any) -> str:
    if v is None or pd.isna(v): return ''
    return SPACE.sub(' ', str(v).strip().casefold())


def phone(v: Any) -> str:
    s = NON_DIGIT.sub('', str(v or ''))
    return s[-10:] if len(s) >= 10 else s


def digest(v: Any) -> str:
    return hashlib.sha256(norm(v).encode()).hexdigest()[:12] if norm(v) else ''


def dt(v: Any) -> pd.Timestamp | None:
    if not norm(v): return None
    parsed = pd.to_datetime(v, errors='coerce', utc=True)
    return None if pd.isna(parsed) else parsed


def text_tokens(value: Any) -> set[str]:
    return {x for x in re.findall(r'[a-z0-9]{3,}', norm(value)) if x not in {'appointment', 'service', 'mobile', 'change', 'oil', 'customer'} }


def date_key(v: Any) -> str:
    parsed = dt(v)
    return parsed.strftime('%Y-%m-%d') if parsed is not None else norm(v)[:10]


def time_minutes(v: Any) -> int | None:
    parsed = dt(v)
    if parsed is not None: return parsed.hour * 60 + parsed.minute
    m = re.search(r'(\d{1,2}):(\d{2})', str(v or ''))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def main() -> None:
    cal = pd.read_csv(ROOT / 'remaining-processed/calendar-events.cleaned.review.csv', dtype='string', keep_default_na=False).fillna('')
    appt = pd.read_csv(ROOT / 'csv-processed/appointments.cleaned.csv', dtype='string', keep_default_na=False).fillna('')
    cust = pd.read_csv(ROOT / 'cleaned/customers.cleaned.csv', dtype='string', keep_default_na=False).fillna('')

    appt_by_date: dict[str, list[int]] = {}
    for i, r in appt.iterrows(): appt_by_date.setdefault(date_key(r['appointment_date']), []).append(i)
    cust_by_email: dict[str, list[int]] = {}
    cust_by_phone: dict[str, list[int]] = {}
    cust_by_name: dict[str, list[int]] = {}
    for i, r in cust.iterrows():
        e = norm(r['email']); p = phone(r['phone']); n = norm((r['first_name'] + ' ' + r['last_name']).strip())
        if e: cust_by_email.setdefault(e, []).append(i)
        if p: cust_by_phone.setdefault(p, []).append(i)
        if n: cust_by_name.setdefault(n, []).append(i)

    mappings = []
    counts: dict[str, int] = {}
    for _, event in cal.iterrows():
        event_text = ' '.join(str(event.get(k, '')) for k in ('summary','description','location'))
        event_tokens = text_tokens(event_text)
        event_date = date_key(event['starts_at'])
        event_time = time_minutes(event['starts_at'])
        event_emails = {x.casefold() for x in EMAIL.findall(event_text)}
        event_phones = {phone(x) for x in re.findall(r'(?:\+?\d[\d\s().-]{7,}\d)', event_text) if phone(x)}

        appt_candidates = []
        for i in appt_by_date.get(event_date, []):
            a = appt.loc[i]
            score = 0
            evidence = []
            a_time = time_minutes(a['appointment_time'])
            if event_time is not None and a_time is not None and abs(event_time - a_time) <= 15:
                score += 4; evidence.append('date_time_within_15m')
            a_tokens = text_tokens(' '.join(str(a.get(k, '')) for k in ('title','customer_name','vehicle','location')))
            overlap = event_tokens & a_tokens
            if overlap:
                score += min(3, len(overlap)); evidence.append('text_overlap:' + str(len(overlap)))
            if norm(a['customer_email']) in event_emails and norm(a['customer_email']): score += 6; evidence.append('email')
            if phone(a['customer_phone']) in event_phones and phone(a['customer_phone']): score += 6; evidence.append('phone')
            if score: appt_candidates.append((score, i, evidence))
        appt_candidates.sort(reverse=True)
        best_appt = appt_candidates[0] if appt_candidates else None
        second_score = appt_candidates[1][0] if len(appt_candidates) > 1 else 0

        customer_candidates: set[int] = set()
        customer_evidence = []
        for e in event_emails:
            customer_candidates.update(cust_by_email.get(e, [])); customer_evidence.append('email')
        for p in event_phones:
            customer_candidates.update(cust_by_phone.get(p, [])); customer_evidence.append('phone')
        # Name-only matching is retained as candidate evidence, never auto-approved.
        for i, c in cust.iterrows():
            if text_tokens((c['first_name'] + ' ' + c['last_name'])) & event_tokens:
                customer_candidates.add(i)
        if best_appt:
            a = appt.loc[best_appt[1]]
            for i in cust_by_email.get(norm(a['customer_email']), []): customer_candidates.add(i)
            for i in cust_by_phone.get(phone(a['customer_phone']), []): customer_candidates.add(i)

        if best_appt and best_appt[0] >= 7 and best_appt[0] > second_score + 1:
            classification = 'strong_appointment_candidate'
            recommended = 'Human-confirm the event is the same appointment; then link by external key.'
        elif best_appt and best_appt[0] >= 4:
            classification = 'ambiguous_appointment_candidate'
            recommended = 'Review competing/date-time/text evidence; do not auto-link.'
        elif best_appt:
            classification = 'weak_appointment_candidate'
            recommended = 'Keep calendar-only unless a source owner confirms the appointment mapping.'
        else:
            classification = 'calendar_only_no_appointment_match'
            recommended = 'Keep as calendar-only or manually create an appointment after confirming service/customer meaning.'
        counts[classification] = counts.get(classification, 0) + 1
        mappings.append({
            'calendar_external_key': event['external_key'],
            'event_date': event_date,
            'event_summary_token': digest(event['summary']),
            'appointment_external_key': appt.loc[best_appt[1], 'external_key'] if best_appt else '',
            'appointment_match_score': best_appt[0] if best_appt else 0,
            'appointment_evidence': ';'.join(best_appt[2]) if best_appt else '',
            'competing_appointment_score': second_score,
            'customer_candidate_count': len(customer_candidates),
            'customer_evidence': ';'.join(sorted(set(customer_evidence))),
            'classification': classification,
            'recommended_action': recommended,
        })
    out = pd.DataFrame(mappings).sort_values(['classification','event_date','calendar_external_key'])
    out.to_csv(OUT / 'calendar-mapping-review.csv', index=False)
    report = {
        'business_name': 'MOMS Mobile Oil Change',
        'calendar_events_inspected': len(cal),
        'appointment_records_compared': len(appt),
        'customer_records_compared': len(cust),
        'classification_counts': dict(sorted(counts.items())),
        'matching_policy': [
            'Exact email/phone evidence is strongest.',
            'Same date plus time within 15 minutes is supporting evidence, not proof.',
            'Text/name overlap is candidate evidence only.',
            'No event is auto-imported or auto-merged.',
            'Calendar events without defensible appointment evidence remain calendar-only.',
        ],
        'pii_handling': 'Review queue contains deterministic keys and summary tokens; raw customer contact values are not emitted.',
        'import_gate': 'review_required',
    }
    (OUT / 'mapping-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    md = ['# MOMS Mobile Oil Change — Calendar Mapping Review', '', f"Inspected **{len(cal)} calendar events**, compared against **{len(appt)} cleaned appointments** and **{len(cust)} cleaned customer records**. No mappings were imported or merged.", '', '## Classification summary', '', '| Classification | Events | Treatment |', '|---|---:|---|']
    meanings = {
        'strong_appointment_candidate': 'Human-confirm then link to the proposed appointment external key.',
        'ambiguous_appointment_candidate': 'Review competing evidence; do not auto-link.',
        'weak_appointment_candidate': 'Keep calendar-only unless source owner confirms.',
        'calendar_only_no_appointment_match': 'Keep calendar-only or manually create after confirming semantics.',
    }
    for key, value in sorted(counts.items()): md.append(f'| `{key}` | {value} | {meanings.get(key, "Review required.")} |')
    md += ['', '## Decision rule', '', 'The calendar workbook is not a customer master source. Email and phone matches can establish strong evidence, while names and text overlap remain ambiguous. Date/time proximity supports a mapping but cannot establish identity by itself.']
    (OUT / 'README.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
