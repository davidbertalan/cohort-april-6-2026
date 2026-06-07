# Implementation Plan: 003 — CSV Import

Source task: [docs/tasks/003-csv-import.md](../tasks/003-csv-import.md)

## Goal

Implement real CSV parsing by: adding the `CsvHelper` NuGet package, creating `CsvImporter` in a new `Processing/` subfolder, registering it in DI, and replacing the placeholder `ImportAsync` body in `ImportApi.cs` with the real implementation that calls the importer and saves to the DB. Update `test-api.http` with a working import test.

## Current State (verified)

- [ImportApi.cs](../../src/BudgetTracker.Api/Features/Transactions/Import/ImportApi.cs) — exists with a placeholder `ImportAsync` body (hardcoded zeros, never touches DB or `CsvImporter`). `ValidateFileInput` is already correct and can be kept as-is.
- [Program.cs](../../src/BudgetTracker.Api/Program.cs) — has no `CsvImporter` DI registration yet.
- [BudgetTracker.Api.csproj](../../src/BudgetTracker.Api/BudgetTracker.Api.csproj) — `CsvHelper` is **not** listed; must be added.
- `src/BudgetTracker.Api/Features/Transactions/Import/Processing/` — folder does not exist yet.
- [test-api.http](../../test-api.http) — has a placeholder import test; needs an inline-data test block added.
- `samples/generic-bank-sample.csv` exists and can be used for file-reference testing.

## ⚠️ Notes on the task doc

1. **`using` in `CsvImporter.cs`** — the task shows `using BudgetTracker.Api.Features.Transactions;` but the checkpoint has `using BudgetTracker.Api.Infrastructure;`. Neither is actually needed: `Transaction` is in the parent namespace `BudgetTracker.Api.Features.Transactions` which is implicitly accessible, and `ImportResult` is in the same file's namespace. The checkpoint version is the correct one to follow; drop the spurious using entirely and keep only `System.Globalization`, `System.Text`, `CsvHelper`, and `CsvHelper.Configuration`.

2. **`TryParseDate` is not `static`** — the method only calls `DateTime.TryParse` with no instance state, yet it lacks the `static` modifier (unlike `TryParseAmount` and `GetColumnValue` which are `static`). This builds fine but is inconsistent. The checkpoint has the same inconsistency, so follow the checkpoint and leave it non-static to match.

3. **Step 3.5 adds an inline-data test block** — the task shows a new `### Test Complete Import with Sample CSV` request that embeds CSV rows inline (not via `< file` reference). This should be appended to `test-api.http` rather than replacing the existing requests.

4. **`ImportAsync` signature change** — adding `CsvImporter csvImporter` as a parameter. Minimal API parameter binding automatically resolves it from DI; no attribute needed.

## Steps

### 1. Install CsvHelper package

From `src/BudgetTracker.Api/`:

```bash
dotnet add package CsvHelper --version 33.1.0
```

Verify it appears in [BudgetTracker.Api.csproj](../../src/BudgetTracker.Api/BudgetTracker.Api.csproj).

### 2. Create `Import/Processing/CsvImporter.cs`

New file — follow the checkpoint version (namespace `BudgetTracker.Api.Features.Transactions.Import.Processing`, usings: `System.Globalization`, `System.Text`, `CsvHelper`, `CsvHelper.Configuration`):

Key logic:
- `ParseCsvAsync` opens a `StreamReader` + `CsvReader` with `HasHeaderRecord = true`, `MissingFieldFound = null`, `BadDataFound = null`.
- Iterates `csv.GetRecordsAsync<dynamic>()`, calls `ParseTransactionRow` per row, sets `UserId` and `Account` on successful parses.
- After the loop, recalculates `result.ImportedCount = transactions.Count` and `result.FailedCount = result.TotalRows - result.ImportedCount`.
- `ParseTransactionRow` uses `GetColumnValue` with fallback column name lists for Description, Date, Amount, Balance, Category. Returns `null` on any parse failure (caught by the per-row try/catch in the caller).
- `GetColumnValue` is `static`, `TryParseDate` is non-static, `TryParseAmount` is `static`.
- `TryParseAmount` strips `$`, `€`, `£`, `¥`, `R$` before `decimal.TryParse(..., NumberStyles.Currency, CultureInfo.InvariantCulture, ...)`.
- Sets `Category` to `"Uncategorized"` when the column is missing or blank.

### 3. Register `CsvImporter` in DI

Edit [Program.cs](../../src/BudgetTracker.Api/Program.cs) — add after the `AddDbContext` line:

```csharp
using BudgetTracker.Api.Features.Transactions.Import.Processing;

// ...

builder.Services.AddScoped<CsvImporter>();
```

### 4. Replace placeholder `ImportAsync` in `ImportApi.cs`

Edit [ImportApi.cs](../../src/BudgetTracker.Api/Features/Transactions/Import/ImportApi.cs):

- Add `using BudgetTracker.Api.Features.Transactions.Import.Processing;` at the top.
- Change the `ImportAsync` signature to add `CsvImporter csvImporter` before `BudgetTrackerContext context`.
- Replace the placeholder try-body with:
  ```csharp
  var userId = claimsPrincipal.GetUserId();
  using var stream = file.OpenReadStream();
  var (result, transactions) = await csvImporter.ParseCsvAsync(stream, file.FileName, userId, account);

  if (transactions.Any())
  {
      await context.Transactions.AddRangeAsync(transactions);
      await context.SaveChangesAsync();
  }

  return TypedResults.Ok(result);
  ```
- Keep `ValidateFileInput` and `MapTransactionImportEndpoints` exactly as they are.

### 5. Append inline-data test to `test-api.http`

Append to [test-api.http](../../test-api.http) (do not remove existing requests):

```http
### Test Complete Import with Sample CSV
POST http://localhost:5295/api/transactions/import
X-API-Key: test-key-user1
Content-Type: multipart/form-data; boundary=WebAppBoundary

--WebAppBoundary
Content-Disposition: form-data; name="account"

Checking Account
--WebAppBoundary
Content-Disposition: form-data; name="file"; filename="generic-bank-sample.csv"
Content-Type: text/csv

Date,Description,Amount,Balance
01/15/2025,Amazon Purchase,-45.67,1250.33
01/16/2025,Coffee Shop,-5.89,1244.44
01/17/2025,Salary Deposit,2500.00,3744.44
01/18/2025,Netflix Subscription,-15.99,3728.45
01/19/2025,Gas Station,-52.30,3676.15
01/20/2025,Grocery Store,-89.45,3586.70
01/21/2025,Uber Ride,-12.50,3574.20
01/22/2025,Apple Services,-2.99,3571.21
01/23/2025,Cash Withdrawal,-60.00,3511.21
01/24/2025,Music Streaming,-9.99,3501.22
--WebAppBoundary--

### Test Transaction List After Import
GET http://localhost:5295/api/transactions
X-API-Key: test-key-user1
```

## Verification

1. `dotnet build` succeeds with 0 errors.
2. `POST /api/transactions/import` with the inline CSV returns `{ "totalRows": 10, "importedCount": 10, "failedCount": 0, ... }`.
3. `GET /api/transactions` returns the 10 imported transactions.
4. Rows appear in the DB: `SELECT id, date, description, amount FROM "Transactions" LIMIT 10;`

## Files to create / edit

| Action | Path |
|--------|------|
| Create | `src/BudgetTracker.Api/Features/Transactions/Import/Processing/CsvImporter.cs` |
| Edit   | `src/BudgetTracker.Api/BudgetTracker.Api.csproj` (via `dotnet add package`) |
| Edit   | `src/BudgetTracker.Api/Program.cs` |
| Edit   | `src/BudgetTracker.Api/Features/Transactions/Import/ImportApi.cs` |
| Edit   | `test-api.http` |
