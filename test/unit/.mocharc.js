"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
module.exports = {
    require: "chai",
    recursive: true,
    slow: 2000,
    timeout: "30s",
    ui: "bdd",
    global: ["sails", "luxon", "moment", "_"],
};
if (process.env.CI === "true") {
    console.log("Mocha running in CI.");
    // (For CI) Run mocha and write results to a junit format file:
    module.exports["reporter"] = "mocha-junit-reporter";
    module.exports["reporter-option"] = "mochaFile=./.tmp/junit/backend-mocha/backend-mocha.xml";
}
else {
    console.log("Mocha running in local dev.");
    // (For development) Run mocha and show the results on stdout:
    module.exports["reporter"] = "spec";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLm1vY2hhcmMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90eXBlc2NyaXB0L3Rlc3QvdW5pdC8ubW9jaGFyYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7O0FBRWIsTUFBTSxDQUFDLE9BQU8sR0FBRztJQUNiLE9BQU8sRUFBRSxNQUFNO0lBQ2YsU0FBUyxFQUFFLElBQUk7SUFDZixJQUFJLEVBQUUsSUFBSTtJQUNWLE9BQU8sRUFBRSxLQUFLO0lBQ2QsRUFBRSxFQUFFLEtBQUs7SUFDVCxNQUFNLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUM7Q0FDNUMsQ0FBQztBQUVGLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssTUFBTSxFQUFFLENBQUM7SUFDNUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBQ3BDLCtEQUErRDtJQUMvRCxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLHNCQUFzQixDQUFDO0lBQ3BELE1BQU0sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsR0FBRyx3REFBd0QsQ0FBQztBQUNqRyxDQUFDO0tBQU0sQ0FBQztJQUNKLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztJQUMzQyw4REFBOEQ7SUFDOUQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxNQUFNLENBQUM7QUFDeEMsQ0FBQyJ9