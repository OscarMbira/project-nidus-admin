# ID to Application Report

## Overview

The **ID to Application Report** maps **ID generation rules** from `admin.id_generation_rules` — one row per configured table — to its application and database table.

## Route

- **Path:** `/system/id-to-application-report`
- **Sidebar:** SYSTEM & SECURITY → ID GENERATION → ID to Application Report

## Columns

| Column | Source |
|--------|--------|
| Table Abbreviation | `id_generation_rules.table_abbreviation` |
| Application | Derived from schema: `admin` → Admin, `public` → Platform, `sim` → Simulator |
| Target Table | `id_generation_rules.target_table` |
| Table Name | Table portion without schema |
| Table Description | `id_generation_rules.table_description` |

## Export

Uses the Platform-style export dropdown (ported to Admin):

- Excel
- Word
- PowerPoint
- PDF
- CSV
- XML
- JSON
- Print

Exports respect the current search and filter criteria.

## SQL

Apply navigation seed after v52:

`SQL/v158_id_to_application_report_nav_seed.sql`
