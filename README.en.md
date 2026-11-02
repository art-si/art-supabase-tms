<div align="center">
  <h1>Yiqi Workshop TMS</h1>
  <p><strong>Transportation management from master data and order entry to dispatch, execution, tracking, delivery, and operational analysis</strong></p>
  <p>
    <a href="https://gitee.com/art-si/art-supabase-tms">Gitee</a> ·
    <a href="https://github.com/art-si/art-supabase-tms">GitHub</a> ·
    <a href="https://gitee.com/art-si/art-supabase-pro">Platform</a> ·
    <a href="https://gitee.com/art-si/supabase-mobile-tms-driver">Driver App</a> ·
    <a href="https://art-si.github.io/art-supabase-doc/modules/tms">Documentation</a> ·
    <a href="./README.md">简体中文</a>
  </p>
</div>

## Overview

> Updated November 2, 2026. This overview reflects the checked-in implementation and business documentation. Availability depends on backend deployment, tenant configuration, and account permissions. Screenshots show earlier product versions.

Yiqi Workshop TMS connects customers, carriers, drivers, cargo, contracts, pricing, orders, waybills, dispatch, in-transit monitoring, proof of delivery, and finance collaboration.

This repository owns TMS pages, APIs, domain types, transportation rules, and dedicated Edge Functions. Authentication, tenancy, navigation, permissions, layout, shared components, stores, and the shared Supabase client come from [`art-supabase-pro`](https://gitee.com/art-si/art-supabase-pro).

![AI-assisted order entry](screenshots/ai-order-copilot.png)

![Real-time in-transit monitoring](screenshots/in-transit-monitor.png)

## Capabilities

| Area | Included capabilities |
| --- | --- |
| Master data | Customers and addresses, routes, cargo, carriers with multiple types/channels, drivers, stations, pricing, contracts, and company credentials |
| Order entry | Text/image-assisted entry, reviewable master-data matching, separate quotations, orders, and status tracking |
| Dispatch | Capacity planning, standard/split/merged dispatch, resource validation, and certificate risk checks |
| Execution | Appointments, loading/unloading, departure/arrival, signatures, proof-of-delivery OCR, exceptions, return trips, and driver commissions |
| Monitoring | Vehicle/waybill maps, route performance, alerts, and AI-assisted anomaly analysis |
| Business analysis | Monthly, customer, route, order, vehicle, driver, receivable, and business-risk reports |
| Operations | Vehicle dispatch, driver operations, order transit, receipt tracking, exceptions, carrier performance, and six operational KPIs |
| Collaboration | Driver H5/Mini Program execution, VMS vehicles/certificates, FMS expense/settlement/accounting, and platform workflows |

## Recent Improvements

- Separate quotation drafts and submissions, multi-type/multi-channel carriers, electronic contracts, transport agreements, service cases, blacklists, and company credentials.
- Return-trip tasks and waybill associations, driver commission rules and waybill commission details, and driver finance/default-payee information.
- Certificate revocation and renewal gates: revoked documents cannot use an expiry override. An explicitly linked, effective replacement is required to clear the corresponding dispatch blocker.
- Fifteen dedicated business and operational report pages with queries, pagination, focus mode, and drill-down based on the last successful query.
- Salary, vehicle insurance, and posted depreciation allocations across six business dimensions, with deduplication against explicitly classified waybill expenses.
- Configuration-based `ArtForm` fields and shared table, upload, vehicle-type, dialog, drawer, and async-state components.

Report amounts require both report access and source/field permissions. Missing sources, allocation evidence, or permission produces a pending result, rather than zero. Reconciled cost and margin remain narrower than full net profit: unassigned vehicle costs, unlinked maintenance/fine sources, and other uncollected expenses require further reconciliation. KPIs also preserve unknown values when reliable inputs are unavailable.

Quotations are stored separately from receivable expenses. Submitting a quote records an internal status and does not notify the customer.

## Transportation Workflow

```text
Customer request
  → order entry / AI extraction
  → orders and waybills
  → capacity planning and dispatch
  → loading / departure / transit
  → arrival / unloading / delivery
  → proof of delivery / expenses / settlement / analysis
```

AI creates reviewable drafts and recommendations. Authorized operators confirm business saves and state changes, subject to server-side rules.

The separate [`supabase-mobile-tms-driver`](https://gitee.com/art-si/supabase-mobile-tms-driver) application supports H5 and WeChat Mini Program execution: assignment acceptance, location check-ins, loading/unloading, departure/arrival, signatures, mileage, proof of delivery, and expense evidence join the same controlled waybill lifecycle.

## Development and Build

Requirements: Node.js `>= 22.13.0` and pnpm `>= 11.28.2`; the package manager is pinned to `pnpm@11.28.2`.

```powershell
pnpm install
pnpm dev
```

The default development URL is `http://localhost:3016`. In-transit maps also require an AMap browser key, security code, and allowed domains.

The frontend can run independently or inside the platform Git-submodule workspace. An independent install uses the platform archive pinned in `package.json`. In a complete workspace, Vite prefers the main platform source; `ART_SUPABASE_PLATFORM_ROOT` can explicitly select the platform directory. Shared environment values load from the platform, with module values taking precedence. Configure the public Supabase URL and anon/publishable key for your backend; menus and permissions still come from that backend.

```powershell
pnpm check
pnpm build
pnpm preview
```

`pnpm check` runs module-boundary, UI, type, ESLint, Stylelint, and unit-test checks. `pnpm build` checks types before building. Production output is written to `docs/`, with `/art-supabase-tms/` configured in the production environment.

## Architecture and Security

- Commit domain changes here, then update the main repository's `modules/art-supabase-tms` gitlink. Cross-domain reads use tenant-scoped, minimal API/RPC contracts.
- Ordinary users stay within their authenticated tenant. Platform super administrators follow all-tenant/selected-tenant scope; existing records and child records retain their row/parent tenant.
- Ordinary users can access permitted read-only AI and create tenant-owned master data through AI with the corresponding business `Add` permission. Other AI business mutations, configuration, publishing, and workflow-state changes require platform-super authorization in both UI and server boundaries.
- Deletion checks use `MasterDataDeleteGuard` before confirmation. Failed checks block deletion; server-side permissions, references, and concurrency checks remain authoritative.
- UI visibility is not authorization. RLS, RPC validation, and Edge Functions enforce the final boundary. Never expose service-role or AI-provider secrets through Vite environment variables.

The [Chinese README](README.md) retains detailed historical implementation and verification records. Those records describe specific test scopes rather than certification of all business flows.

## License

Released under [MulanPSL-2.0](LICENSE).
