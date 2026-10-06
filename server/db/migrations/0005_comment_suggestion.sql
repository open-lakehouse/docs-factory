-- A suggested edit on a thread root: the anchored passage verbatim as the
-- reviewer saw it (rendered prose, or source lines for a code selector) and its
-- replacement. An empty replacement proposes a deletion. All null when the
-- comment carries no suggestion. suggestion_state_by is a display login, or
-- 'system' when RegisterVersion detects the replacement in a new version.
alter table comment add column if not exists suggestion_original text;
alter table comment add column if not exists suggestion_replacement text;
alter table comment add column if not exists suggestion_state text
  check (suggestion_state in ('open', 'applied', 'dismissed'));
alter table comment add column if not exists suggestion_state_by text;
alter table comment add column if not exists suggestion_state_at timestamptz;
