The confirmation link doubles as a topic selector. One click = verified + subscribed to the topics they chose. No separate "manage preferences" needed for the first interaction.

The migration is straightforward:

Drop the simple newsletter_subscriptions table
Create the richer newsletter_signups table (from feedless schema)
Update auth.js to POST to a new Worker endpoint that creates the pending row
Add a preferences page on feedfree.tech or cnxt.to that handles ?token=xxx
Edge Function to confirm + set topics

Sign up on cnxt → check Digest box → pending row created → confirmation email sent
                                                                    ↓
                            Link goes to preferences page (confirm email + pick topics)
                                                                    ↓
                                              confirmed → Listmonk sync