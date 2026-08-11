# Sample freight ledger (synthetic data)

Same columns, same live formulas and same formatting the
platform writes into the real books. Every consignee and
waybill below is invented.

| FECHA | AERO | AWB | CONSIGNEE | MARK | PIECES | FULL BXS | GROSS | VOLUM | AVG GROSS | AVG VOLUM | CHARG | RATE | FITO | T&E | TOTAL | INV # |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 04-Aug-26 | SAMPLE AIR | 145-0000 0001 | NORTHWIND BLOOMS | NB-01 | 40 | 20.00 | 720 | 800 | 36.00 | 40.00 | 800.00 | $2.40 | $2.00 | - | $1,922.00 | 1000 |
| 04-Aug-26 | SAMPLE AIR | 145-0000 0001 | ACME FLORAL CO | ACME LD | 2 | 1.00 | 25 | 22 | 25.00 | 22.00 | 25.00 | $2.40 | - | - | $60.00 | 1001 |
| 04-Aug-26 | SAMPLE AIR | 145-0000 0001 | EXAMPLE GARDENS | - | 20 | 5.00 | 100 | 125 | 20.00 | 25.00 | 125.00 | $2.25 | - | - | $281.25 | 1002 |
| 05-Aug-26 | SAMPLE AIR | 145-0000 0002 | NORTHWIND BLOOMS | NB-02 | 15 | 7.50 | 250 | 240 | 33.33 | 32.00 | 250.00 | $2.40 | $2.00 | $15.00 | $617.00 | 1003 |
| 05-Aug-26 | SAMPLE AIR | 145-0000 0002 | SAMPLE ROSES LLC | SR-11 | 5 | 2.00 | 60 | 70 | 30.00 | 35.00 | 70.00 | $2.60 | - | - | $182.00 | 1004 |
| 06-Aug-26 | SAMPLE AIR | 145-0000 0003 | PLACEHOLDER FLOWERS | PF-07 | 30 | 15.00 | 550 | 600 | 36.67 | 40.00 | 600.00 | $2.30 | $2.00 | - | $1,382.00 | 1005 |
| 06-Aug-26 | SAMPLE AIR | 145-0000 0003 | EXAMPLE GARDENS | - | 10 | 5.00 | 160 | 175 | 32.00 | 35.00 | 175.00 | $2.25 | - | - | $393.75 | 1006 |
| 07-Aug-26 | SAMPLE AIR | 145-0000 0004 | ACME FLORAL CO | ACME LD | 25 | 12.50 | 400 | 450 | 32.00 | 36.00 | 450.00 | $2.40 | $2.00 | - | $1,082.00 | 1007 |

**Totals:** 2,495.00 chargeable kg / $5,920.00

Formulas live in the sheet, not baked values:
`AVG = GROSS/FULL BXS` / `CHARG = MAX(GROSS, VOLUM)` / `TOTAL = CHARG*RATE + FITO + T&E`
