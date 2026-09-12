// Run with mongosh --file; avoids Windows native argument quote stripping.
const hello = db.adminCommand({ hello: 1 });
if (!hello.setName) {
    const options = db.adminCommand({ getCmdLineOpts: 1 });
    if (options.parsed?.replication?.replSetName !== "rs0") {
        throw new Error("Expected configured replica set rs0; refusing initialization");
    }
    const result = db.adminCommand({
        replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] },
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
} else if (hello.setName !== "rs0") {
    throw new Error("Unexpected existing replica set; refusing changes");
}
let primary = false;
for (let attempt = 0; attempt < 60; attempt++) {
    if (db.adminCommand({ hello: 1 }).isWritablePrimary) { primary = true; break; }
    sleep(500);
}
if (!primary) throw new Error("Primary election did not finish within 30 seconds");
print("Replica set rs0 is primary");
