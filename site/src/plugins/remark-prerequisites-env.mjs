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
 * Below the commands goes the stack's committed topology,
 * `<envsDir>/<folder>/diagram.png` titled `trestle=<folder>`, as an image
 * relative to the page, so the image plugins that run later ship the PNG and
 * upgrade it to the interactive diagram. Without `envsDir`, or a folder with no
 * diagram, the commands stand alone.
 *
 * `:::deployment{key="uc-hybrid/compose.yaml"}` is replaced by that stack's
 * deployment (content-core deploymentSteps) as an ordered list: download the
 * bundle, then each Trestle step's title and instructions. A link in them is
 * relative to the environment's folder, so it becomes the file's name in code.
 *
 * `environment` null (no script needs a stack) leaves the page as authored,
 * minus any bare `:::environment` marker. `guide` is `{ href, title }`, or null
 * when this emit doesn't publish it. `resolve(key)` is content-core's
 * registryEnvironment for this site (throws on an unknown key), or null, which
 * drops keyed markers too.
 */
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { composeParts, deploymentSteps } from "../content-core/environment.mjs";

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

/** The stack's diagram as an image relative to `pagePath`, or none. */
function diagramNodes(env, { envsDir, pagePath }) {
  if (!envsDir || !pagePath) return [];
  const { dir } = composeParts(env.key);
  const png = join(envsDir, dir, "diagram.png");
  if (!existsSync(png)) return [];
  const url = relative(dirname(pagePath), png).split(sep).join("/");
  const image = {
    type: "image",
    url,
    alt: `The services ${env.title} runs and how clients reach them`,
    title: `trestle=${dir}`,
  };
  return [paragraph(image)];
}

function startNodes(env, where) {
  return [
    paragraph(
      text(`Download the docs' environment and start ${env.title}. Already running it? Skip this.`),
    ),
    commandsBlock(env),
    ...diagramNodes(env, where),
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

/** Instructions Markdown as blocks, its folder-relative links unwrapped to code. */
function stepBlocks(markdown) {
  const unlink = (node) => {
    node.children = node.children?.map((child) => {
      if (child.type === "link" && !/^([a-z]+:|\/|#)/i.test(child.url)) {
        return code(child.children.map((c) => c.value ?? "").join(""));
      }
      unlink(child);
      return child;
    });
  };
  const root = fromMarkdown(markdown);
  unlink(root);
  return root.children;
}

function deploymentList(env) {
  return {
    type: "list",
    ordered: true,
    start: 1,
    spread: true,
    children: deploymentSteps(env).map(({ title, markdown }) => ({
      type: "listItem",
      spread: true,
      children: [paragraph({ type: "strong", children: [text(title)] }), ...stepBlocks(markdown)],
    })),
  };
}

/** Replace each `:::deployment{key}` marker under `node`; drop them without `resolve`. */
function replaceDeployments(node, resolve) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (!isDirective("deployment")(child)) {
      replaceDeployments(child, resolve);
      return [child];
    }
    const key = child.attributes?.key;
    return key && resolve ? [deploymentList(resolve(key))] : [];
  });
}

function findDirective(node, name) {
  for (const child of node.children ?? []) {
    if (isDirective(name)(child)) return child;
    const inner = findDirective(child, name);
    if (inner) return inner;
  }
  return null;
}

function insertTutorialStep(tree, env, where) {
  const journey = findDirective(tree, "journey");
  if (journey) {
    const heading = { type: "heading", depth: 3, children: [text(STEP_TITLE)] };
    journey.children.unshift(heading, ...startNodes(env, where));
    return;
  }
  const heading = { type: "heading", depth: 2, children: [text(STEP_TITLE)] };
  const first = tree.children.findIndex((n) => n.type === "heading" && n.depth === 2);
  tree.children.splice(
    first === -1 ? tree.children.length : first,
    0,
    heading,
    ...startNodes(env, where),
  );
}

/**
 * @param {{ environment: object | null, guide?: { href: string, title: string } | null,
 *   diataxis?: string | null, resolve?: ((key: string) => object) | null,
 *   envsDir?: string | null }} options
 */
export default function remarkPrerequisitesEnv({
  environment,
  guide = null,
  diataxis = null,
  resolve = null,
  envsDir = null,
}) {
  return (tree, file) => {
    const where = { envsDir, pagePath: file?.history?.[0] ?? file?.path ?? null };
    replaceDeployments(tree, resolve);
    const nodesFor = (key) => {
      if (key) {
        if (!resolve) return [];
        const env = resolve(key);
        return [commandsBlock(env), ...diagramNodes(env, where)];
      }
      return environment ? startNodes(environment, where) : [];
    };
    const placed = replaceMarkers(tree, nodesFor);
    if (!environment) return;
    if (!placed && diataxis === "tutorial") insertTutorialStep(tree, environment, where);

    const box = tree.children.find(isDirective("prerequisites"));
    if (!box) return;
    const items = [dockerItem()];
    if (!placed && diataxis !== "tutorial") items.push(pointerItem(environment, guide));
    const list = box.children.find((n) => n.type === "list" && !n.ordered);
    if (list) list.children.unshift(...items);
    else box.children.push({ type: "list", ordered: false, spread: false, children: items });
  };
}
