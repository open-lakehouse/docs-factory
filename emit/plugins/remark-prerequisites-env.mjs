/**
 * remark-prerequisites-env — fill a page's `:::prerequisites` box with what its
 * scripts need: a "Docker with Compose v2, ports … free" bullet after the
 * authored ones, and a nested `:::environment[Title]` holding the commands that
 * download and start the stack (content-core pageEnvironment). Both targets run
 * it, so the site box and the .md twin say the same thing.
 *
 * `environment` null (no script needs a stack) leaves the box as authored.
 * `guide` is `{ href, title }` for the long-form setup page, or null when this
 * emit doesn't publish it.
 */
import { portList } from "../../site/src/content-core/environment.mjs";

const text = (value) => ({ type: "text", value });
const code = (value) => ({ type: "inlineCode", value });
const paragraph = (...children) => ({ type: "paragraph", children });

function dockerItem(ports) {
  const free = ports.length
    ? `, with port${ports.length > 1 ? "s" : ""} ${portList(ports)} free`
    : "";
  return {
    type: "listItem",
    spread: false,
    children: [paragraph(text(`Docker with Compose v2${free}.`))],
  };
}

function environmentNode(env, guide) {
  const after = [
    text("Already running it? Skip this. Stop it with "),
    code(env.stop),
    text(" from "),
    code(env.dir),
    text("."),
  ];
  if (guide) {
    after.push(text(" "), {
      type: "link",
      url: guide.href,
      children: [text(guide.title)],
    });
    after.push(text(" explains the setup."));
  }
  const children = [
    { type: "paragraph", data: { directiveLabel: true }, children: [text(env.title)] },
    { type: "code", lang: "bash", meta: null, value: env.commands.join("\n") },
    paragraph(...after),
  ];
  if (env.runUrl) {
    children.push(
      paragraph(text("To run every example on this page at once: "), code(`uv run ${env.runUrl}`)),
    );
  }
  return { type: "containerDirective", name: "environment", attributes: {}, children };
}

export default function remarkPrerequisitesEnv({ environment, guide = null }) {
  return (tree) => {
    if (!environment) return;
    const box = tree.children.find(
      (n) => n.type === "containerDirective" && n.name === "prerequisites",
    );
    if (!box) return;
    const list = box.children.find((n) => n.type === "list" && !n.ordered);
    if (list) list.children.push(dockerItem(environment.ports));
    else
      box.children.push({
        type: "list",
        ordered: false,
        spread: false,
        children: [dockerItem(environment.ports)],
      });
    box.children.push(environmentNode(environment, guide));
  };
}
