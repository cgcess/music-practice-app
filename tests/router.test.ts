import { describe, expect, it } from "vitest";
import { matchRoute, parseHash, type Route } from "../src/ui/router";

const routes: Route<string>[] = [
  { path: "/", view: "default" },
  { path: "/repertoire", view: "rep" },
  { path: "/songs/:id", view: "song" },
];
const m = (hash: string) => matchRoute(routes, parseHash(hash));

describe("router", () => {
  it("empty hash and #/ go to default route", () => {
    expect(m("")?.route.view).toBe("default");
    expect(m("#")?.route.view).toBe("default");
    expect(m("#/")?.route.view).toBe("default");
  });
  it("extracts params", () => {
    expect(m("#/songs/42")?.params).toEqual({ id: "42" });
  });
  it("decodes params", () => {
    expect(m("#/songs/a%20b%2Fc")?.params).toEqual({ id: "a b/c" });
  });
  it("unknown -> null", () => {
    expect(m("#/nope")).toBeNull();
    expect(m("#/songs")).toBeNull();
    expect(m("#/songs/1/extra")).toBeNull();
  });
  it("malformed encoding -> null", () => {
    expect(m("#/songs/%")).toBeNull();
    expect(m("#/songs/%E0%A4%A")).toBeNull();
  });
  it("trailing slash matches same route", () => {
    expect(m("#/repertoire/")).toEqual(m("#/repertoire"));
    expect(m("#/repertoire/")).not.toBeNull();
  });
});
