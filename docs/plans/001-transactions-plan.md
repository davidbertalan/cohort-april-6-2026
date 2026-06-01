# Implementation Plan: 001 — Transaction Model

Source task: [docs/tasks/001-transactions.md](../tasks/001-transactions.md)

## Goal

Add the core `Transaction` domain model, its DTO + mapping, register it on the EF Core `DbContext` with indexes and a user foreign key, then generate and apply the `AddTransactionEntity` migration.

## Current State (verified)

- [BudgetTrackerContext.cs](../../src/BudgetTracker.Api/Infrastructure/BudgetTrackerContext.cs) is an `IdentityDbContext<ApplicationUser>` with an **empty** `OnModelCreating` and **no** `Transactions` DbSet.
- No `src/BudgetTracker.Api/Features/Transactions/` folder exists yet.
- [ApplicationUser.cs](../../src/BudgetTracker.Api/Auth/ApplicationUser.cs) is a bare `IdentityUser` (its `Id` is `string`), so `Transaction.UserId` as `string` and the FK `HasPrincipalKey(u => u.Id)` line up correctly.
- Only the `Identity` migration exists under [Infrastructure/Migrations/](../../src/BudgetTracker.Api/Infrastructure/Migrations/).
- Reference implementation lives at [checkpoints/01-week-end/](../../checkpoints/01-week-end/src/BudgetTracker.Api/) — use it to compare, not copy blindly.

## ⚠️ Correction to the task doc

Step 1.3 in the task lists `entity.HasKey(...)`, `entity.Property(...)`, and `entity.HasOne(...)` as bare statements — but `entity` is never declared there, so **that code will not compile**. Use the checkpoint's form instead, wrapping those calls in a configuration lambda:

```csharp
modelBuilder.Entity<Transaction>(entity =>
{
    entity.HasKey(e => e.Id);
    entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
    entity.HasOne<ApplicationUser>()
        .WithMany()
        .HasForeignKey(t => t.UserId)
        .HasPrincipalKey(u => u.Id);
});
```

## Steps

1. **Create the Transactions feature folder + entity/DTO**
   - New file `src/BudgetTracker.Api/Features/Transactions/TransactionTypes.cs`.
   - Add the `Transaction` entity (Step 1.1), the `TransactionDto`, and the `internal static TransactionExtensions.MapToDto` (Step 1.2) — all in the one file, namespace `BudgetTracker.Api.Features.Transactions`.

2. **Register the entity on the DbContext**
   - Edit [BudgetTrackerContext.cs](../../src/BudgetTracker.Api/Infrastructure/BudgetTrackerContext.cs):
     - Add `using BudgetTracker.Api.Features.Transactions;`
     - Add `public DbSet<Transaction> Transactions { get; set; }`
     - In `OnModelCreating` (after `base.OnModelCreating`), add the three `HasIndex` calls (`Date`, `UserId`, `ImportedAt`) and the entity-config lambda from the correction above.

3. **Generate the migration**
   - From `src/BudgetTracker.Api/`: ensure `dotnet-ef` is installed, then `dotnet ef migrations add AddTransactionEntity`.
   - Confirm a new migration pair appears under `Infrastructure/Migrations/` and the model snapshot updates.

4. **Apply the migration**
   - Ensure Postgres is up (`docker compose up -d` from `docker/`).
   - From `src/BudgetTracker.Api/`: `dotnet ef database update`.

## Verification

- `dotnet build` succeeds with no warnings about the context.
- A `Transactions` table exists in the `budgettracker` DB with indexes on `Date`, `UserId`, `ImportedAt`, a `gen_random_uuid()` default on `Id`, and an FK to the Identity users table.
- Optional sanity check: compare the generated migration against [checkpoints/01-week-end/.../20250924140428_AddTransactionEntity.cs](../../checkpoints/01-week-end/src/BudgetTracker.Api/Infrastructure/Migrations/20250924140428_AddTransactionEntity.cs).

## Notes

- No API endpoints, services, or frontend work in this task — those come in 002 onward.
- If the API was started for testing, stop it when finished (per project conventions).
