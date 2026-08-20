# v158 — ID to Application Report

## Goal

Add an exportable Admin report mapping generated display IDs to their application (Admin / Platform / Simulator) and target table.

## Todo

- [x] Port Platform export utilities (`exportUtils`, `ExportListMenu`, PDF support)
- [x] Create report utils + page with filters and summary cards
- [x] Register route and sidebar nav (`defaultAdminNav` + SQL seed)
- [x] Unit tests + documentation

## Review

- Route: `/system/id-to-application-report`
- Sidebar: SYSTEM & SECURITY → ID GENERATION → ID to Application Report
- Export formats: Excel, Word, PowerPoint, PDF, CSV, XML, JSON, Print
- Apply SQL: `SQL/v158_id_to_application_report_nav_seed.sql`
