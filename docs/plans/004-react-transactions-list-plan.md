# Implementation Plan: 004 — React Transactions List

Source task: [docs/tasks/004-react-transactions-list.md](../tasks/004-react-transactions-list.md)

## Goal

Create the TypeScript types, API service, and `TransactionList` component for the transactions feature, then replace the placeholder `routes/transactions.tsx` with a real implementation that fetches and displays transaction data using React Router v7's data loader pattern.

## Current State (verified)

- `src/BudgetTracker.Web/src/features/transactions/` — **folder does not exist**. Only `features/auth/` exists.
- [routes/transactions.tsx](../../src/BudgetTracker.Web/src/routes/transactions.tsx) — exists as a placeholder. Its `loader` returns `{}` and the component renders a TODO card. The route **is already wired** in `main.tsx` as `loader: transactionsLoader`.
- [main.tsx](../../src/BudgetTracker.Web/src/main.tsx) — already imports `Transactions` and `loader as transactionsLoader` from `./routes/transactions`. Already registers the route at `path: 'transactions'`. **No changes needed here.**
- [routes/root.tsx](../../src/BudgetTracker.Web/src/routes/root.tsx) — already has a `<NavLink to="/transactions">Transactions</NavLink>` in the nav. **No changes needed.**
- [routes/dashboard.tsx](../../src/BudgetTracker.Web/src/routes/dashboard.tsx) — placeholder with no link to transactions. The task says to "verify dashboard links" — but none exist yet. Given it's a "verify" step in the task doc, and it's not critical for the feature to work, it is **out of scope for this task**.
- Shared components all verified present: `EmptyState`, `Pagination`, `SkeletonCardRow` (from `Skeleton.tsx`), `Header`.
- `formatDate` exists in [shared/utils/formatters.ts](../../src/BudgetTracker.Web/src/shared/utils/formatters.ts).

## ⚠️ Notes on the task doc

1. **Steps 4.1–4.2 say "verify"** — but `features/transactions/types.ts` and `features/transactions/api.ts` do not exist in the template. They must be **created**, not just checked.

2. **`types.ts` is incomplete in the task doc** — the `api.ts` imports `GetTransactionsParams`, `ImportTransactionsParams`, and `ImportResult` from `./types`, but the task doc's `types.ts` snippet only shows `Transaction` and `TransactionListDto`. All four extra types must also be in `types.ts`.

3. **`import { useLoaderData, useNavigation } from 'react-router'`** — the codebase mixes `react-router` and `react-router-dom` imports (both work; `react-router-dom` re-exports from `react-router`). Follow the task doc and use `'react-router'` in `TransactionList.tsx`, consistent with `Pagination.tsx`.

4. **The loader in `routes/transactions.tsx` is exported as `loader`**, not `transactionsLoader` — `main.tsx` already imports it as `import Transactions, { loader as transactionsLoader } from './routes/transactions'`. Keep this convention: export it as `loader`.

5. **The backend returns `PagedResult<Transaction>` (entity, not DTO)** — this means `userId` will also be present in the response items. The TypeScript `Transaction` type should just ignore it (no `userId` field needed on the frontend type since it's never shown).

6. **Steps 4.5–4.7 are "verify" steps** — routing is already wired and nav is already in place. Dashboard links are not present but that's an optional nicety outside the scope of this task.

## Steps

### 1. Create `features/transactions/types.ts`

New file. Include all types referenced by `api.ts` plus the core domain types:

```typescript
export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  category?: string;
  labels?: string;
  importedAt: string;
  sourceFile?: string;
  account: string;
}

export interface TransactionListDto {
  items: Transaction[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface GetTransactionsParams {
  page?: number;
  pageSize?: number;
}

export interface ImportTransactionsParams {
  formData: FormData;
  onUploadProgress?: (progressEvent: ProgressEvent) => void;
}

export interface ImportResult {
  totalRows: number;
  importedCount: number;
  failedCount: number;
  errors: string[];
  sourceFile?: string;
  importSessionHash?: string;
  importedAt: string;
}
```

### 2. Create `features/transactions/api.ts`

New file — straight from the task doc. No changes needed:

```typescript
import { apiClient } from '../../api';
import type {
  TransactionListDto,
  GetTransactionsParams,
  ImportTransactionsParams,
  ImportResult
} from './types';

export const transactionsApi = {
  async getTransactions(params: GetTransactionsParams = {}): Promise<TransactionListDto> {
    const { page = 1, pageSize = 20 } = params;
    const response = await apiClient.get<TransactionListDto>('/transactions', {
      params: { page, pageSize }
    });
    return response.data;
  },

  async importTransactions(params: ImportTransactionsParams): Promise<ImportResult> {
    const response = await apiClient.post<ImportResult>('/transactions/import', params.formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: params.onUploadProgress
    });
    return response.data;
  }
};
```

### 3. Create `features/transactions/components/TransactionList.tsx`

New file — from the task doc. Uses `from 'react-router'` (not `react-router-dom`):

```tsx
import { useLoaderData, useNavigation } from 'react-router';
import type { TransactionListDto } from '../types';
import EmptyState from '../../../shared/components/EmptyState';
import Pagination from '../../../shared/components/Pagination';
import { SkeletonCardRow } from '../../../shared/components/Skeleton';
import { formatDate } from '../../../shared/utils/formatters';
```

The component renders:
- Skeleton rows (`SkeletonCardRow`) when `navigation.state === 'loading'`
- `EmptyState` when no items, with an action button that navigates to `/import`
- A list of transaction cards with description, category badge, account badge, date, and color-coded amount
- `Pagination` when `data.totalPages > 1`

### 4. Update `routes/transactions.tsx`

Replace the placeholder entirely. The file must:
- Export a `loader` function (imported as `transactionsLoader` in `main.tsx`) that reads `page`/`pageSize` from search params and calls `transactionsApi.getTransactions()`
- Default-export a `Transactions` page component that renders `<Header>` + `<TransactionList />`

```tsx
import { type LoaderFunctionArgs } from 'react-router-dom';
import Header from '../shared/components/layout/Header';
import TransactionList from '../features/transactions/components/TransactionList';
import { transactionsApi } from '../features/transactions/api';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
  return await transactionsApi.getTransactions({ page, pageSize });
}

export default function Transactions() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <Header
        title="Transactions"
        subtitle="Your imported bank transactions"
      />
      <TransactionList />
    </div>
  );
}
```

## Verification

1. `npm run build` (or `tsc --noEmit`) succeeds with no TypeScript errors.
2. Start the API (`dotnet run` from `src/BudgetTracker.Api/`) and the frontend (`npm run dev` from `src/BudgetTracker.Web/`).
3. Log in and navigate to `/transactions`.
4. With no data: `EmptyState` renders with "Import Transactions" button.
5. After importing via `test-api.http`: transactions appear with green/red amounts, category/account badges, and correct dates.
6. With >20 transactions: `Pagination` component renders.
7. Stop both processes when done.

## Files to create / edit

| Action | Path |
|--------|------|
| Create | `src/BudgetTracker.Web/src/features/transactions/types.ts` |
| Create | `src/BudgetTracker.Web/src/features/transactions/api.ts` |
| Create | `src/BudgetTracker.Web/src/features/transactions/components/TransactionList.tsx` |
| Edit   | `src/BudgetTracker.Web/src/routes/transactions.tsx` |
