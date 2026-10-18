import test from "node:test";
import assert from "node:assert/strict";
import { RideOperationsBot } from "../src/bots/ride-operations.js";

test("ride operations rejects invalid location", () => {
  const bot = new RideOperationsBot();
  assert.equal(bot.planAssignment({ bookingId: "b1", pickup: { latitude: 200, longitude: 0 }, candidates: [] }).reason, "LOCATION_OUT_OF_RANGE");
});

test("ride operations recommends nearest eligible driver without writing assignment", () => {
  const bot = new RideOperationsBot();
  const result = bot.planAssignment({
    bookingId: "b1",
    serviceType: "PASSENGER",
    pickup: { latitude: 25, longitude: 86 },
    candidates: [
      { driverId: "far", isOnline: true, isApproved: true, isAvailable: true, serviceTypes: ["PASSENGER"], location: { latitude: 26, longitude: 87 } },
      { driverId: "near", isOnline: true, isApproved: true, isAvailable: true, serviceTypes: ["PASSENGER"], location: { latitude: 25.01, longitude: 86.01 } },
      { driverId: "offline", isOnline: false, isApproved: true, isAvailable: true, serviceTypes: ["PASSENGER"], location: { latitude: 25, longitude: 86 } }
    ]
  });
  assert.equal(result.recommendation.driverId, "near");
  assert.equal(result.writesEnabled, false);
  assert.equal(result.action, "RECOMMEND_ONLY");
});

 
test("ride operations rejects a missing booking ID", () => {
  const bot = new RideOperationsBot();
  const result = bot.planAssignment({
    bookingId: " ",
    pickup: { latitude: 25, longitude: 86 },
    candidates: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "BOOKING_ID_REQUIRED");
});

test("ride operations rejects a missing pickup location", () => {
  const bot = new RideOperationsBot();
  const result = bot.planAssignment({
    bookingId: "b1",
    pickup: null,
    candidates: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "LOCATION_MISSING");
});

test("ride operations rejects candidates when they are not an array", () => {
  const bot = new RideOperationsBot();
  const result = bot.planAssignment({
    bookingId: "b1",
    pickup: { latitude: 25, longitude: 86 },
    candidates: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "CANDIDATES_MUST_BE_ARRAY");
});

test("ride operations does not recommend a driver without a valid driver ID", () => {
  const bot = new RideOperationsBot();
  const result = bot.planAssignment({
    bookingId: "b1",
    serviceType: "PASSENGER",
    pickup: { latitude: 25, longitude: 86 },
    candidates: [{
      isOnline: true,
      isApproved: true,
      isAvailable: true,
      serviceTypes: ["PASSENGER"],
      location: { latitude: 25, longitude: 86 }
    }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.recommendation, null);
  assert.equal(result.writesEnabled, false);
  assert.equal(result.action, "RECOMMEND_ONLY");
});
