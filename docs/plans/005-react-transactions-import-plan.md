# Implementation Plan: 005 — React Transactions Import

Source task: [docs/tasks/005-react-transactions-import.md](../tasks/005-react-transactions-import.md)

## Goal

Create the `FileUpload` component with drag-and-drop, progress tracking, and result display, then replace the placeholder `routes/import.tsx` with a real implementation that renders it.

## Current State (verified)

- [routes/import.tsx](../../src/BudgetTracker.Web/src/routes/import.tsx) — exists as a placeholder. Renders a TODO card with a fake upload area. Already registered in `main.tsx` at `path: 'import'`. **No changes needed in `main.tsx` or `root.tsx`.**
- [features/transactions/api.ts](../../src/BudgetTracker.Web/src/features/transactions/api.ts) — already has `importTransactions` with `onUploadProgress`. Step 5.1 is already done.
- `src/BudgetTracker.Web/src/pages/` — **folder does not exist**.
- [shared/components/LoadingSpinner.tsx](../../src/BudgetTracker.Web/src/shared/components/LoadingSpinner.tsx) — exists, exports `LoadingSpinner` as a **named export** (`export function LoadingSpinner`), not a default export. The task's import must reflect this.
- `features/transactions/api.ts` exports `transactionsApi` as a named export but does **not** re-export `ImportResult`. The task's `FileUpload.tsx` has `import { transactionsApi, type ImportResult } from '../api'` — this won't compile because `ImportResult` lives in `../types`, not `../api`. Must fix the import path.
- Navigation and routing: already complete — `root.tsx` has `<NavLink to="/import">Import</NavLink>` and `main.tsx` routes `import` to `<Import />`.

## ⚠️ Notes on the task doc

1. **Step 5.1 is already done** — `api.ts` has `importTransactions` with `onUploadProgress`. Nothing to do.

2. **Step 5.3 (`ImportPage`) is unnecessary** — the task asks to create `src/pages/ImportPage.tsx` and then add a new route for it, but `routes/import.tsx` already exists and is already wired at `path: 'import'`. The correct approach is to **replace the existing `routes/import.tsx`** with the `FileUpload` component (same as was done for `routes/transactions.tsx` in task 004), not add a new `pages/` layer.

3. **Steps 5.4–5.5 are already done** — the `/import` route is in `main.tsx` and the nav link is in `root.tsx`. No changes needed.

4. **`LoadingSpinner` is a named export** — the task shows `import { LoadingSpinner } from '../../../shared/components/LoadingSpinner'`. This is correct (it's a named export). Do not use a default import.

5. **`ImportResult` import path is wrong in the task doc** — `FileUpload.tsx` uses `import { transactionsApi, type ImportResult } from '../api'` but `ImportResult` is only exported from `../types`. Fix to: `import type { ImportResult } from '../types'` and `import { transactionsApi } from '../api'` separately.

6. **`progressEvent.total` can be `undefined`** — Axios `AxiosProgressEvent` has `total?: number`. The progress calculation `Math.round((progressEvent.loaded * 100) / progressEvent.total)` will produce `NaN` if `total` is undefined. Guard it: `progressEvent.total ? Math.round(...) : 0`.

7. **`useNavigate` import** — the task shows `import { useNavigate } from 'react-router'`. The codebase also uses `react-router-dom` for this. Either works; follow `react-router` to stay consistent with `TransactionList.tsx`.

## Steps

### 1. Create `features/transactions/components/FileUpload.tsx`

New file — based on the task doc with the following corrections applied:
- Split the import: `import type { ImportResult } from '../types'` (separate from `transactionsApi`)
- Guard `progressEvent.total`: `progressEvent.total ? Math.round((progressEvent.loaded * 100) / progressEvent.total) : 0`
- Keep `import { useNavigate } from 'react-router'`
- Keep `import { LoadingSpinner } from '../../../shared/components/LoadingSpinner'` (named export, correct)

The component logic (no changes from the task):
- `useState` for `selectedFile`, `isDragOver`, `isUploading`, `uploadProgress`, `account`, `importResult`
- `useEffect` on mount to fetch XSRF token via `GET /antiforgery/token`
- Drag-and-drop handlers: `onDragOver`, `onDragLeave`, `onDrop` → call `handleFileSelect`
- `validateFile`: rejects non-`.csv` and files over 10MB
- `handleImport`: builds `FormData`, calls `transactionsApi.importTransactions`, shows toast, redirects after 3s
- Renders: drop zone → file details + account input → progress bar → import result summary

### 2. Replace `routes/import.tsx`

Replace the placeholder with a minimal page that renders `FileUpload` under the existing `Header`. Keep the same structure as `routes/transactions.tsx`:

```tsx
import Header from '../shared/components/layout/Header';
import FileUpload from '../features/transactions/components/FileUpload';

export default function Import() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <Header
        title="Import Transactions"
        subtitle="Upload a CSV bank statement to import transactions"
      />
      <FileUpload />
    </div>
  );
}
```

No `loader` needed — this page does not pre-fetch data.

## Verification

1. `npm run build` succeeds with 0 TypeScript errors.
2. Start the API and frontend, navigate to `/import`.
3. Drag a CSV file onto the drop zone — border turns blue, file name appears.
4. Click "Browse Files" — file picker opens, CSV is accepted.
5. Enter an account name, click "Import Transactions" — progress bar advances, success toast appears.
6. After 3 seconds, browser redirects to `/transactions` and the imported rows are visible.
7. Non-CSV file rejected with "Please select a CSV file" toast.
8. Stop both processes when done.

## Files to create / edit

| Action | Path |
|--------|------|
| Create | `src/BudgetTracker.Web/src/features/transactions/components/FileUpload.tsx` |
| Edit   | `src/BudgetTracker.Web/src/routes/import.tsx` |
