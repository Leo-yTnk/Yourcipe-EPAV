# Prepared retirement — do not merge yet

This branch publishes a transition page and removes the old backend workflow. Merge only after EPAVOne migration has been deployed and real-account acceptance is complete. Disable the old workflow in Actions before enabling the EPAVOne deploy gate; repository concurrency groups do not coordinate across repositories.

The existing backend project, users and data remain intact. Old assets/history remain recoverable. No automatic repository archival is authorized.

Canonical runbook: https://github.com/Leo-yTnk/EPAVOne/blob/feat/complete-yourcipe-migration/docs/migration-closeout.md
