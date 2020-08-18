const core = require('@actions/core');
const github = require('@actions/github');
const {promisify} = require('util');
const { writeFile, readFileSync } = require("fs");

const writeFileAsync = promisify(writeFile);

main().catch((error) => setFailed(error.message));

async function writeToFile(changelogLine) {
  // get the changelog file
  const path = "./CHANGELOG.md";
  const fileContents = readFileSync(path,'utf8');

  // Parse through the changelog to find insertion point
  const splitFile = fileContents.split("## Unreleased\n");
  let finalContents = `${splitFile[0]}## Unreleased\n`;

  // add the the changelogline
  finalContents += changelogLine;
  finalContents += "\n";
  finalContents += splitFile[1];

  // write to file
  await writeFileAsync(path, finalContents);
}

async function main() {
  try {
    const {
      payload
    } = github.context;
    // If this is a Github Issue comment, then skip
    if (!payload.issue.pull_request) {
      core.setOutput("success", false);
      return;
    }

    const payload2 = JSON.stringify(payload, undefined, 2)
    console.log(`The event payload: ${payload2}`);

    let prBody = payload.issue.body;

    // get info from the payload
    let commentBody = payload.comment.body;
    const prLink = payload.issue.html_url;
    const prNum = payload.issue.number;

    // check that the payload will have the repo info we'll need
    if (!payload.repository) {
      core.info('unable to determine repository from request type');
      core.setOutput("success", false);
      return;
    }

    const full_name = payload.repository.full_name;
    const [owner, repo] = full_name.split('/');

    const repoToken = process.env['GITHUB_TOKEN'];
    const octokit = github.getOctokit(repoToken);

    // Find the location of the changelog line in the PR comment
    const feature = commentBody.indexOf('[Feature]');
    const patch = commentBody.indexOf('[Patch]'); 
    const release = commentBody.indexOf('[Release]');

    // get the loaction of the start of the line in the string
    const changelogLocation = feature !== -1 ? feature :
      (patch !== -1 ? patch : release)

    // output variable defining whether action should add/commit changelog.md
    // don't want to commit if no files are edited bc will cause an error
    let foundline = true;

    // will we add a comment to the PR thread?
    let pushComment = true;
    let commentMessage = ":warning: No Changelog line provided, please update the `Changelog Entry` section of the PR comment. Describe in one line your changes, like so: [Feature] Updated **ComponentName** with new `propName` to fix alignment ";
    
    // Get past prComments to check if this latest one will be a duplicate of the last one
    const prComments = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNum,
    });

    let lastComment = "";
    if (prComments.data.length > 0) {
      lastComment = prComments.data.pop().body;
    } 

    // if changelog line isn't present in the pr comment
    if (changelogLocation === -1) {
      if (lastComment === commentMessage ) {
        pushComment = false;
      }
      foundline = false;
    } else {
      // Get the changelog line
      const changelogKey = feature !== -1 ? '[Feature]' :
      (patch !== -1 ? '[Patch]' : '[Release]')
      let prSplit = commentBody.split(changelogKey)[1];
      prSplit = prSplit.split(/\r?\n/)[0];
      
      // format the final changelog line
      let changelogLine = "- ";
      changelogLine = changelogLine.concat(changelogKey, prSplit, " ([#", prNum, '](', prLink, "))");

      // check that this changelogLine isn't the same as the last comment's
      // if so, don't bother with a new comment
      if (lastComment.indexOf('```') !== -1) {
        lastComment = lastComment.split("```\n")[1];
        lastComment = lastComment.split("\n```")[0];
        if (lastComment === changelogLine) { pushComment= false}
      }

      await writeToFile(changelogLine);

      commentMessage= ":tada:  Updated the Unreleased section of the Changelog with: \n```\n".concat(changelogLine, "\n```");

      // Parse through the prBody to find insertion point
      const splitBody = prBody.split("## Changelog Entry\n");
      let newBody = `${splitBody[0]}## Changelog Entry\n`;

      // add the the changelogline
      newBody += changelogLine;
      newBody += "\n";
      newBody += splitFile[1];

      // edit the prbody
      await octokit.pulls.update({
        owner,
        repo,
        'pull_number': prNum,
        body: newBody,
      });
    }
    // if we do want to write a new comment
    if (pushComment) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNum,
        body: commentMessage,
      })
    }

    // determines if the next action will run (add, commit, and push changelog.md)
    core.setOutput("success", foundline);
  } catch (error) {
    core.setFailed(error.message);
  }
}