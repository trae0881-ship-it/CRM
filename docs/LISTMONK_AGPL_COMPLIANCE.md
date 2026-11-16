# listmonk AGPL-3.0 deployment compliance checklist

## Status

listmonk is pinned in the register to `v6.2.0` at commit `ef0a75872463f10a4848af6c547d1c057405453a`. It is **not deployed**. This document is a preparation checklist, not a legal opinion or a claim that compliance requirements have been completed.

## Before deployment

1. Keep listmonk as a separate service. Do not copy or link its source into the proprietary Adometa application without a written legal review.
2. Record the exact source commit, complete upstream LICENSE, all copyright notices, build instructions, modifications, and the dependency/license inventory.
3. Decide whether the deployed program is modified. Preserve a clear patch series and corresponding source for every change.
4. If users interact with a modified version over a network, review AGPL-3.0 section 13 and provide those users a prominent, no-charge offer to obtain the Corresponding Source of the modified version. The source must include the covered source and required build/install scripts as defined by the license.
5. If copies are conveyed, comply with the applicable AGPL/GPLv3 source-conveyance, notice, and license requirements. Do not impose additional restrictions on recipients' licensed rights.
6. Publish an approved compliance/source URL, keep it available for the required period, and verify that the offer points to the exact source used in production.
7. Preserve upstream copyright and license notices and provide the complete license text. Document modifications and their dates.
8. Have qualified counsel assess whether the deployment, modifications, integration boundaries, and source offer meet the license obligations before production use.

## Operational isolation

- Use a separate deployment, PostgreSQL database, SMTP credentials, backups, network policy, and access controls.
- Restrict the administrative interface to authorized operators; do not make internal service ports public.
- Use encrypted backups and test recovery before importing production contacts.
- Establish retention, unsubscribe/suppression, consent, and incident-response procedures before any campaign data is processed.

## Completion evidence

Do not change the register to `DEPLOYED`, `HEALTHY`, or `SECURITY REVIEW COMPLETE` until the service is actually deployed, authenticated health checks pass, the security review is recorded, and the source-offer and notice are externally verified. Store the release, commit, image digest, deployment date, source-offer URL, backup/restore test, and review sign-off with the release record.
