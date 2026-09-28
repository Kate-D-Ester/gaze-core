import { expect, test } from "bun:test"
import { getFrontendOrigins } from "./frontend-origins"

test("trusts both localhost spellings for the configured local frontend", () => {
  expect(getFrontendOrigins("http://localhost:4013")).toEqual([
    "http://localhost:4013",
    "http://127.0.0.1:4013",
  ])
})

test("trusts both loopback spellings when the configured frontend uses the IP", () => {
  expect(getFrontendOrigins("http://127.0.0.1:4013")).toEqual([
    "http://127.0.0.1:4013",
    "http://localhost:4013",
  ])
})

test("does not add loopback aliases to a deployed frontend origin", () => {
  expect(getFrontendOrigins("https://gaze.example.com")).toEqual([
    "https://gaze.example.com",
  ])
})
