/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as vscode from "vscode";
import { CustomProjectLocator } from "../autodetect/abstractLocator";
import { ProjectNode } from "./nodes";
import { Container } from "../core/container";
import { addParentFolderToDuplicates } from "../utils/path";
import { getGitBranch, getGitWorktreeMainPath } from "../utils/git";

export class AutodetectProvider implements vscode.TreeDataProvider<ProjectNode> {

    public readonly onDidChangeTreeData: vscode.Event<ProjectNode | void>;

    private projectSource: CustomProjectLocator;
    private internalOnDidChangeTreeData: vscode.EventEmitter<ProjectNode | void> = new vscode.EventEmitter<ProjectNode | void>();
    // main repository path -> its linked worktree nodes (filled while building the root)
    private worktrees = new Map<string, ProjectNode[]>();

    constructor(projectSource: CustomProjectLocator) {
        this.projectSource = projectSource;
        this.onDidChangeTreeData = this.internalOnDidChangeTreeData.event;
    }

    public refresh(): void {
        this.internalOnDidChangeTreeData.fire();
    }

    public getTreeItem(element: ProjectNode): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: ProjectNode): Thenable<ProjectNode[]> {

        // loop !!!
        return new Promise(resolve => {

            if (element) {

                resolve(this.worktrees.get(element.preview.path) ?? []);

            } else {

                // ROOT

                // raw list
                const lll: ProjectNode[] = [];
                this.worktrees.clear();

                // Locators (VSCode/Git/Mercurial/SVN)
                // this.projectSource.initializeCfg(this.projectSource.kind);

                const projectList = this.projectSource.getProjectList();
                if (projectList.length > 0) {
                    projectList.sort((n1, n2) => {
                        if (n1.name.toLowerCase() > n2.name.toLowerCase()) {
                            return 1;
                        }

                        if (n1.name.toLowerCase() < n2.name.toLowerCase()) {
                            return -1;
                        }

                        return 0;
                    });

                    const projectsWithParent = addParentFolderToDuplicates(projectList);
                    const showGitBranch = vscode.workspace.getConfiguration("projectManager").get<string>("git.showBranchName", "never");

                    // linked worktrees are nested under their main repository, when it was detected too
                    const mainPathOf = new Map<string, string>();
                    if (this.projectSource.kind === "git") {
                        const detected = new Map<string, string>();
                        for (const p of projectsWithParent) {
                            try {
                                detected.set(fs.realpathSync(p.path), p.path);
                            } catch {
                                // path no longer exists
                            }
                        }
                        for (const p of projectsWithParent) {
                            const mainPath = detected.get(getGitWorktreeMainPath(p.path));
                            if (mainPath && mainPath !== p.path) {
                                mainPathOf.set(p.path, mainPath);
                            }
                        }
                    }
                    const mainPaths = new Set(mainPathOf.values());

                    for (let index = 0; index < projectsWithParent.length; index++) {
                        const dirinfo = projectsWithParent[ index ];

                        let detail = dirinfo.parent;
                        if (showGitBranch === "always" || showGitBranch === "onlyInSideBar") {
                            const gitBranch = getGitBranch(dirinfo.path);
                            if (gitBranch) {
                                if (detail) {
                                    // Has parent folder info (duplicates), combine with branch
                                    detail = `${detail} | ${gitBranch}`;
                                } else {
                                    // No parent folder info, show just the branch
                                    detail = gitBranch;
                                }
                            }
                        }

                        const node = new ProjectNode(dirinfo.name,
                            mainPaths.has(dirinfo.path) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                            dirinfo.icon, {
                                name: dirinfo.name,
                                detail: detail,
                                path: dirinfo.path
                            }, {
                                command: "_projectManager.open",
                                title: "",
                                arguments: [ dirinfo.path, dirinfo.name ],
                            });

                        const mainPath = mainPathOf.get(dirinfo.path);
                        if (mainPath) {
                            this.worktrees.set(mainPath, [ ...(this.worktrees.get(mainPath) ?? []), node ]);
                        } else {
                            lll.push(node);
                        }
                    }
                }

                resolve(lll);
            }
        });
    }

    public async showTreeView(): Promise<void> {

        // The "auto-detected" views depends if some project have been detected
        // this.projectSource.initializeCfg(this.projectSource.kind);
        if (!this.projectSource.isAlreadyLocated()) {
            await this.projectSource.locateProjects();
        }

        const projectList = this.projectSource.getProjectList();
        if (this.projectSource.displayName === "Git") {
            const hideGitWelcome = Container.context.globalState.get<boolean>("hideGitWelcome", false);
            vscode.commands.executeCommand("setContext", "projectManager.canShowTreeView" + this.projectSource.displayName,
                projectList.length > 0 || !hideGitWelcome);
        } else {
            vscode.commands.executeCommand("setContext", "projectManager.canShowTreeView" + this.projectSource.displayName,
                projectList.length > 0);
        }
        return;
    }

}
