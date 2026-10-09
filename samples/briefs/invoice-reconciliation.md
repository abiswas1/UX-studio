---
id: invoice-reconciliation
name: Ledgerline — invoice reconciliation
platforms: [web]
---

Design a web dashboard that helps finance teams at companies with 50–500 employees match supplier invoices to purchase orders and payments.

Today accounts-payable staff export data from their accounting system into spreadsheets and match line by line. Mismatches (wrong quantities, partial deliveries, duplicate invoices, currency differences) take most of the time, and month-end close is stressful.

The first release should:
- import invoices, purchase orders and bank payments from CSV files;
- auto-match what it can and explain why each match was made;
- give a clear queue of exceptions to resolve, with the evidence side by side;
- let a reviewer approve resolutions and export an audit trail.

Constraints: desktop web only. Users are keyboard-heavy and work with dense data. Every automated decision must be explainable for audit.
