import { expect, test } from "bun:test"
import { getFrontendOrigins } from "./frontend-origins"

test("trusts both dev ports and loopback hostnames for localhost config", () => {
  const origins = getFrontendOrigins("http://localhost:4013")

  expect(origins).toContain("http://localhost:4001")
  expect(origins).toContain("http://localhost:4013")
  expect(origins).toContain("http://127.0.0.1:4001")
  expect(origins).toContain("http://127.0.0.1:4013")
})

test("trusts both dev ports and loopback hostnames for IP config", () => {
  const origins = getFrontendOrigins("http://127.0.0.1:4001")

  expect(origins).toContain("http://localhost:4001")
  expect(origins).toContain("http://localhost:4013")
  expect(origins).toContain("http://127.0.0.1:4001")
  expect(origins).toContain("http://127.0.0.1:4013")
})

test("does not add loopback aliases to a deployed frontend origin", () => {
  expect(getFrontendOrigins("https://gaze.example.com")).toEqual([
    "https://gaze.example.com",
  ])
})
