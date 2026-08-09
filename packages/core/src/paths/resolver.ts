import { join } from 'node:path'
import { homedir } from 'node:os'
import { CLOUDAGENT_DIR_NAME, SKILLS_DIR_NAME, SYSTEM_DIR_NAME } from './constants.js'

export class CloudagentPaths {
  private readonly _homeDir: string

  constructor(homeDir?: string) {
    this._homeDir = homeDir ?? process.env.CLOUDAGENT_HOME ?? join(homedir(), CLOUDAGENT_DIR_NAME)
  }

  get homeDir(): string {
    return this._homeDir
  }

  /** Resolve under CLOUDAGENT_HOME */
  dir(...segments: string[]): string {
    return join(this._homeDir, ...segments)
  }

  /** Resolve under CLOUDAGENT_HOME/.system */
  systemDir(...segments: string[]): string {
    return join(this._homeDir, SYSTEM_DIR_NAME, ...segments)
  }

  /** Resolve under <projectRoot>/.cloudagent */
  projectDir(projectRoot: string, ...segments: string[]): string {
    return join(projectRoot, CLOUDAGENT_DIR_NAME, ...segments)
  }

  // --- Skills ---

  systemSkillsDir(): string {
    return this.systemDir(SKILLS_DIR_NAME)
  }

  userSkillsDir(): string {
    return this.dir(SKILLS_DIR_NAME)
  }

  projectSkillsDir(projectRoot: string): string {
    return this.projectDir(projectRoot, SKILLS_DIR_NAME)
  }

  allSkillDirs(projectRoot: string): string[] {
    return [
      this.projectSkillsDir(projectRoot),
      this.userSkillsDir(),
      this.systemSkillsDir(),
    ]
  }
}