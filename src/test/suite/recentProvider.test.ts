/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");
import os = require("os");
import * as assert from "assert";
import * as vscode from "vscode";
import { CustomProjectLocator } from "../../autodetect/abstractLocator";
import { RecentProvider } from "../../sidebar/recentProvider";
import { Container } from "../../core/container";

suite("RecentProvider", () => {
    suiteSetup(() => {
        // project icons are resolved from the extension folder
        Container.initialize(<vscode.ExtensionContext> <unknown> { extensionUri: vscode.Uri.file(os.tmpdir()) });
    });

    test("lists recently added git repositories newest first", async () => {
        const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "recent-test-")));
        try {
            const projects = [ "old", "new" ].map(name => ({ name, fullPath: path.join(root, name), icon: "git" }));
            for (const project of projects) {
                fs.mkdirSync(path.join(project.fullPath, ".git"), { recursive: true });
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            projects.push({ name: "gone", fullPath: path.join(root, "gone"), icon: "git" });

            const provider = new RecentProvider(<CustomProjectLocator> <unknown> { getProjectList: () => projects });
            const added = (await provider.getChildren()).find(group => group.label === "Recently Added Git Repositories");
            const children = await provider.getChildren(added);

            assert.deepStrictEqual(children.map(child => child.label), [ "new", "old" ]);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
