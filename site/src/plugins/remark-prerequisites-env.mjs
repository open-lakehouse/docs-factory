/**
 * remark-prerequisites-env — tell the reader about the stack a page's scripts
 * need (content-core pageEnvironment). The `:::prerequisites` box always gains
 * a "Docker with Compose v2" bullet ahead of the authored ones; the start
 * commands go where the page's Diátaxis type wants them:
 *
 * - an authored, empty `:::environment` container anywhere in the body is
 *   replaced by the commands (a page whose task is starting the stack);
 *   `:::environment{key="uc-aws/compose.yaml"}` is replaced by just
 *   the code block for that registry stack, so one page can start several;
 * - else a tutorial gets them as its first step, `### Start the environment`
 *   at the top of its first `::::journey` (or a `##` section before its first
 *   `##` if it has none);
 * - else the box gets one bullet naming the stack and linking `guide`, the
 *   page that starts it. A how-to assumes the reader can follow that link.
 *
 * The commands are plain Markdown, so the site, the review app, and the .md
 * twin render them alike. Both emit targets and the review app run this.
 *
 * `environment` null (no script needs a stack) leaves the page as authored,
 * minus any bare `:::environment` marker. `guide` is `{ href, title }`, or null
 * when this emit doesn't publish it. `resolve(key)` is content-core's
 * registryEnvironment for this site (throws on an unknown key), or null, which
 * drops keyed markers too.
 */
const text = (value) => ({ type: "text", value });
const code = (value) => ({ type: "inlineCode", value });
const paragraph = (...children) => ({ type: "paragraph", children });
const link = (url, label) => ({ type: "link", url, children: [text(label)] });
const listItem = (...children) => ({
  type: "listItem",
  spread: false,
  children: [paragraph(...children)],
});

const DOCKER_INSTALL = "https://docs.docker.com/get-started/get-docker/";
const STEP_TITLE = "Start the environment";

const isDirective = (name) => (n) => n.type === "containerDirective" && n.name === name;

// The stack's ports are defaults a reader rarely has taken; the env bundle's
// README lists them for the reader who does.
function dockerItem() {
  return listItem(
    link(DOCKER_INSTALL, "Docker"),
    text(" with Compose v2, for the local environment."),
  );
}

function pointerItem(env, guide) {
  return guide
    ? listItem(text(`${env.title}, running: `), link(guide.href, guide.title), text("."))
    : listItem(text(`${env.title}, running locally.`));
}

function startNodes(env) {
  return [
    paragraph(
      text(`Download the docs' environment and start ${env.title}. Already running it? Skip this.`),
    ),
    commandsBlock(env),
    paragraph(
      text("Stop it later with "),
      code(env.stop),
      text(" from "),
      code(env.dir),
      text("."),
    ),
  ];
}

const commandsBlock = (env) => ({
  type: "code",
  lang: "bash",
  meta: null,
  value: env.commands.join("\n"),
});

/**
 * Replace each `:::environment` marker under `node` with `nodesFor(key)`
 * (`key` null for a bare marker); true if any.
 */
function replaceMarkers(node, nodesFor) {
  if (!node.children) return false;
  let found = false;
  const out = [];
  for (const child of node.children) {
    if (isDirective("environment")(child)) {
      out.push(...nodesFor(child.attributes?.key ?? null));
      found = true;
    } else {
      found = replaceMarkers(child, nodesFor) || found;
      out.push(child);
    }
  }
  node.children = out;
  return found;
}

function findDirective(node, name) {
  for (const child of node.children ?? []) {
    if (isDirective(name)(child)) return child;
    const inner = findDirective(child, name);
    if (inner) return inner;
  }
  return null;
}

function insertTutorialStep(tree, env) {
  const journey = findDirective(tree, "journey");
  if (journey) {
    const heading = { type: "heading", depth: 3, children: [text(STEP_TITLE)] };
    journey.children.unshift(heading, ...startNodes(env));
    return;
  }
  const heading = { type: "heading", depth: 2, children: [text(STEP_TITLE)] };
  const first = tree.children.findIndex((n) => n.type === "heading" && n.depth === 2);
  tree.children.splice(first === -1 ? tree.children.length : first, 0, heading, ...startNodes(env));
}

/**
 * @param {{ environment: object | null, guide?: { href: string, title: string } | null,
 *   diataxis?: string | null, resolve?: ((key: string) => object) | null }} options
 */
export default function remarkPrerequisitesEnv({
  environment,
  guide = null,
  diataxis = null,
  resolve = null,
}) {
  return (tree) => {
    const nodesFor = (key) => {
      if (key) return resolve ? [commandsBlock(resolve(key))] : [];
      return environment ? startNodes(environment) : [];
    };
    const placed = replaceMarkers(tree, nodesFor);
    if (!environment) return;
    if (!placed && diataxis === "tutorial") insertTutorialStep(tree, environment);

    const box = tree.children.find(isDirective("prerequisites"));
    if (!box) return;
    const items = [dockerItem()];
    if (!placed && diataxis !== "tutorial") items.push(pointerItem(environment, guide));
    const list = box.children.find((n) => n.type === "list" && !n.ordered);
    if (list) list.children.unshift(...items);
    else box.children.push({ type: "list", ordered: false, spread: false, children: items });
  };
}
