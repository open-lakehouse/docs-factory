// pageEnvironment: a page's scripts → the one stack they need and its commands.
import { expect, test } from "bun:test";
import { declaredEnvironment, pageEnvironment, portList } from "../environment.mjs";

const REGISTRY = {
  "unitycatalog/compose.yaml": { title: "UC", ports: [8080], clientEnv: {} },
  "unitycatalog/compose.aws.yaml": {
    title: "UC with S3",
    ports: [8080, 9000],
    clientEnv: { AWS_ENDPOINT_URL: "http://localhost:9000" },
  },
};
const OPTS = {
  registry: REGISTRY,
  bundle: "uc-docs-env",
  bundleUrl: "https://d.io/env/uc-docs-env.tar.gz",
  origin: "https://d.io",
};
const py = (environment, fetchUrl = "/how-to/x/snippets/x.py") => ({
  kind: "python",
  environment,
  fetchUrl,
});

test("no environment when no script needs one", () => {
  expect(pageEnvironment([py(null)], OPTS)).toBeNull();
  expect(pageEnvironment([], OPTS)).toBeNull();
});

test("the default compose starts without -f", () => {
  const env = pageEnvironment([py("unitycatalog/compose.yaml")], OPTS);
  expect(env.commands).toEqual([
    "curl -fsSL https://d.io/env/uc-docs-env.tar.gz | tar -xz",
    "cd uc-docs-env/unitycatalog",
    "docker compose up -d --wait",
  ]);
  expect(env.stop).toBe("docker compose down");
  expect(env.runUrl).toBe("https://d.io/how-to/x/snippets/x.py");
});

test("a variant passes -f and exports its client env", () => {
  const shell = { kind: "shell", environment: "unitycatalog/compose.aws.yaml" };
  const env = pageEnvironment([py("unitycatalog/compose.aws.yaml"), shell], OPTS);
  expect(env.commands.slice(2)).toEqual([
    "docker compose -f compose.aws.yaml up -d --wait",
    "export AWS_ENDPOINT_URL=http://localhost:9000",
  ]);
  expect(env.ports).toEqual([8080, 9000]);
});

test("two Python scripts leave no single run URL", () => {
  const env = pageEnvironment(
    [py("unitycatalog/compose.yaml"), py("unitycatalog/compose.yaml", "/how-to/x/snippets/y.py")],
    OPTS,
  );
  expect(env.runUrl).toBeNull();
});

test("a script that imports a helper gets no run URL", () => {
  const script = { ...py("unitycatalog/compose.yaml"), helpers: [{ fetchUrl: "/x/_seed.py" }] };
  expect(pageEnvironment([script], OPTS).runUrl).toBeNull();
});

test("scripts needing two stacks are an error", () => {
  expect(() =>
    pageEnvironment([py("unitycatalog/compose.yaml"), py("unitycatalog/compose.aws.yaml")], OPTS),
  ).toThrow("more than one environment");
});

test("portList reads as prose", () => {
  expect(portList([8080])).toBe("8080");
  expect(portList([8080, 9000])).toBe("8080 and 9000");
  expect(portList([1, 2, 3])).toBe("1, 2, and 3");
});

test("a page can declare its environment without owning scripts", () => {
  const body =
    'Intro.\n\n:::prerequisites{environment="unitycatalog/compose.aws.yaml"}\n- x\n:::\n';
  const declared = declaredEnvironment(body);
  expect(declared).toBe("unitycatalog/compose.aws.yaml");
  expect(pageEnvironment([], { ...OPTS, declared }).title).toBe("UC with S3");
  expect(() => pageEnvironment([py("unitycatalog/compose.yaml")], { ...OPTS, declared })).toThrow(
    "more than one environment",
  );
  expect(declaredEnvironment(":::prerequisites\n:::\n")).toBeNull();
});
