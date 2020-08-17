
const { getInput, setFailed, setOutput } = require("@actions/core");
const { context, getOctokit } = require("@actions/github");

async function main() {
  try {
    const client = getOctokit(getInput("repo_token", { required: true }));

    const { data: { pull_request } } = await client.issues.get({
      ...context.repo,
      issue_number: context.issue.number,
    });

    if (!pull_request) {
      throw Error("Comment is not on a pull request");
    }

    const { data: { head: { ref, sha } } } = await client.pulls.get({
      ...context.repo,
      pull_number: context.issue.number,
    });

    setOutput("ref", ref);
    setOutput("sha", sha);
  } catch (error) {
    setFailed(error.message);
    throw error;
  }
}
