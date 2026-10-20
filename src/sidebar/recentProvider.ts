/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import fs = require("fs");
import path = require("path");
import * as vscode from "vscode";
import { l10n } from "vscode";
import { ThemeIcons } from "vscode-ext-codicons";
import { CustomProjectLocator } from "../autodetect/abstractLocator";
import { isRemoteUri } from "../utils/remote";
import { ProjectNode } from "./nodes";

// ponytail: fixed size, make it a setting if someone asks for it
const MAX_ITEMS = 10;

// shape returned by the internal `_workbench.getRecentlyOpened` command
interface RecentlyOpened {
    workspaces: { folderUri?: vscode.Uri; workspace?: { configPath: vscode.Uri } }[];
}

class RecentGroupNode extends vscode.TreeItem {
    constructor(label: string, icon: vscode.ThemeIcon, public readonly children: ProjectNode[]) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = icon;
    }
}

type RecentNode = RecentGroupNode | ProjectNode;

export class RecentProvider implements vscode.TreeDataProvider<RecentNode> {

    private internalOnDidChangeTreeData = new vscode.EventEmitter<RecentNode | void>();
    public readonly onDidChangeTreeData = this.internalOnDidChangeTreeData.event;

    constructor(private gitLocator: CustomProjectLocator) { }

    public refresh(): void {
        this.internalOnDidChangeTreeData.fire();
    }

    public getTreeItem(element: RecentNode): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: RecentNode): Promise<RecentNode[]> {
        if (element) {
            return element instanceof RecentGroupNode ? element.children : [];
        }

        const groups = [
            new RecentGroupNode(l10n.t("Recently Opened"), ThemeIcons.history, await this.getRecentlyOpened()),
            new RecentGroupNode(l10n.t("Recently Added Git Repositories"), ThemeIcons.repo, this.getRecentlyAddedGitRepositories()),
        ];
        return groups.filter(group => group.children.length > 0);
    }

    private async getRecentlyOpened(): Promise<ProjectNode[]> {
        let recent: RecentlyOpened | undefined;
        try {
            // ponytail: internal command (the File > Open Recent list), the group just disappears if it ever goes away
            recent = await vscode.commands.executeCommand<RecentlyOpened>("_workbench.getRecentlyOpened");
        } catch {
            return [];
        }

        const current = (vscode.workspace.workspaceFile ?? vscode.workspace.workspaceFolders?.[ 0 ]?.uri)?.toString();
        const nodes: ProjectNode[] = [];
        for (const entry of recent?.workspaces ?? []) {
            const uriComponents = entry.folderUri ?? entry.workspace?.configPath;
            if (!uriComponents) {
                continue;
            }

            const uri = vscode.Uri.from(uriComponents);
            const isRemote = isRemoteUri(uri);
            if ((uri.scheme !== "file" && !isRemote) || uri.toString() === current) {
                continue;
            }

            const icon = isRemote ? "favorites-remote" : entry.workspace ? "favorites-workspace" : "favorites";
            nodes.push(this.createNode(path.posix.basename(uri.path, ".code-workspace"),
                isRemote ? uri.toString(true) : uri.fsPath, icon));
            if (nodes.length === MAX_ITEMS) {
                break;
            }
        }
        return nodes;
    }

    private getRecentlyAddedGitRepositories(): ProjectNode[] {
        const repositories: { name: string; path: string; icon: string; addedAt: number }[] = [];
        for (const project of this.gitLocator.getProjectList()) {
            try {
                // `.git` is created on clone/init/worktree add. Falls back to ctime where birthtime is
                // unsupported, which drifts to "last changed" instead of "added"
                const stat = fs.statSync(path.join(project.fullPath, ".git"));
                repositories.push({ name: project.name, path: project.fullPath, icon: project.icon, addedAt: stat.birthtimeMs || stat.ctimeMs });
            } catch {
                // path no longer exists
            }
        }

        return repositories
            .sort((a, b) => b.addedAt - a.addedAt)
            .slice(0, MAX_ITEMS)
            .map(repository => this.createNode(repository.name, repository.path, repository.icon,
                new Date(repository.addedAt).toLocaleDateString(vscode.env.language)));
    }

    private createNode(name: string, projectPath: string, icon: string, detail?: string): ProjectNode {
        return new ProjectNode(name, vscode.TreeItemCollapsibleState.None, icon, {
            name,
            path: projectPath,
            detail
        }, {
            command: "_projectManager.open",
            title: "",
            arguments: [ projectPath, name ],
        });
    }
}
