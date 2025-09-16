jest.mock("node-fetch", () => {
  const actual = jest.requireActual("node-fetch");
  const mockFetch = jest.fn();
  mockFetch.Response = actual.Response;
  return mockFetch;
});

const fetch = require("node-fetch");
const { Response } = jest.requireActual("node-fetch");
const { getPricebook, __test_helpers__ } = require("../services/priceService");

beforeEach(async () => {
  await __test_helpers__.clearCache();
  __test_helpers__.resetCircuit();
  fetch.mockReset();
});

test("returns fresh pricebook when upstream succeeds", async () => {
  const fake = { tokens: [{ symbol: "GCC", price: 0.12 }] };
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(fake), { status: 200 }));
  const res = await getPricebook();
  expect(res.stale).toBe(false);
  expect(res.data).toEqual(fake);
  expect(res.lastUpdated).toBeDefined();
});

test("returns stale cached pricebook when upstream fails after a successful run", async () => {
  const fake = { tokens: [{ symbol: "GCC", price: 0.12 }] };
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(fake), { status: 200 }));
  const fresh = await getPricebook();
  expect(fresh.stale).toBe(false);

  fetch.mockRejectedValueOnce(new Error("network down"));
  const stale = await getPricebook();
  expect(stale.stale).toBe(true);
  expect(stale.data).toEqual(fake);
  expect(stale.lastError).toBeDefined();
});

test("throws when upstream fails and no cache exists", async () => {
  fetch.mockRejectedValueOnce(new Error("network fail"));
  await expect(getPricebook()).rejects.toThrow("UPSTREAM_FAILED_NO_CACHE");
});
