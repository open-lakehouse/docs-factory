import { expect, test } from "bun:test";
import { ContentArea } from "../gen/docs_factory/review/v1/messages_pb";
import { modelOf, modelRef, refFromParam, refHref, refToParam } from "./content-ref";

test("a model ref round-trips through the workspace tab token", () => {
  for (const target of [
    { kind: "element", id: "lakehouse.table" },
    { kind: "view", id: "capabilityMap" },
    { kind: "estate" },
  ] as const) {
    const ref = modelRef(target);
    expect(ref.area).toBe(ContentArea.MODEL);
    const back = refFromParam(refToParam(ref));
    expect(back && modelOf(back)).toEqual(target);
  }
});

test("a model ref routes to the Model explorer", () => {
  expect(refHref(modelRef({ kind: "element", id: "lakehouse.table" }))).toBe(
    "/model?el=lakehouse.table",
  );
  expect(refHref(modelRef({ kind: "estate" }))).toBe("/model");
});

test("a malformed model token is rejected", () => {
  expect(refFromParam("model:elements/x::")).toBeNull();
});
