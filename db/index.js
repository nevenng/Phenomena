// Require the Client constructor from the pg package
const { Client } = require('pg');

// Create a constant, CONNECTION_STRING, from either process.env.DATABASE_URL or postgres://localhost:5432/phenomena-dev


const CONNECTION_STRING = process.env.DATABASE_URL || 'postgres://localhost:5432/phenomena-dev';

// Create the client using new Client(CONNECTION_STRING)


const client = new Client(CONNECTION_STRING);


// Do not connect to the client in this file!

/**
 * Report Related Methods
 */

/**
 * You should select all reports which are open. 
 *  
 * Additionally you should fetch all comments for these
 * reports, and add them to the report objects with a new field, comments.
 * 
 * Lastly, remove the password field from every report before returning them all.
 */

async function getOpenReports() {
  try {
    // First, load all of the reports which are open
    const reportsQuery = `
      SELECT * FROM reports
      WHERE "isOpen" = true
    `;
    const reportsResult = await client.query(reportsQuery);
    const reports = reportsResult.rows;

    // Then load the comments only for those reports
    const reportIds = reports.map(report => report.id);
    const commentsQuery = `
      SELECT * FROM comments
      WHERE "reportId" IN (${reportIds.map((_, i) => `$${i + 1}`).join(',')})
    `;
    const commentsResult = await client.query(commentsQuery, reportIds);
    const commentsByReportId = {};
    commentsResult.rows.forEach(comment => {
      if (!commentsByReportId[comment.reportId]) {
        commentsByReportId[comment.reportId] = [];
      }
      commentsByReportId[comment.reportId].push(comment);
    });

    // Build new properties on each report
    reports.forEach(report => {
      report.comments = commentsByReportId[report.id] || [];
      report.isExpired = Date.parse(report.expirationDate) < new Date();
      delete report.password;
    });

    // Finally, return the reports
    return reports;
  } catch (error) {
    throw error;
  }
}

/**
 * You should use the reportFields parameter (which is
 * an object with properties: title, location, description, password)
 * to insert a new row into the reports table.
 * 
 * On success, you should return the new report object,
 * and on failure you should throw the error up the stack.
 * 
 * Make sure to remove the password from the report object
 * before returning it.
 */
async function createReport(reportFields) {
  const { title, location, description, password } = reportFields;
  try {
    // Insert the correct fields into the reports table
    const insertReportQuery = `
      INSERT INTO reports (title, location, description, password)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [title, location, description, password];
    const result = await client.query(insertReportQuery, values);
    const newReport = result.rows[0];

    // Remove the password from the returned row
    delete newReport.password;

    // Return the new report
    return newReport;
  } catch (error) {
    throw error;
  }
}

/**
 * NOTE: This function is not for use in other files, so we use an _ to
 * remind us that it is only to be used internally.
 * (for our testing purposes, though, we WILL export it)
 * 
 * It is used in both closeReport and createReportComment, below.
 * 
 * This function should take a reportId, select the report whose 
 * id matches that report id, and return it. 
 * 
 * This should return the password since it will not eventually
 * be returned by the API, but instead used to make choices in other
 * functions.
 */
async function _getReport(reportId) {
  try {
    // Select the report with id equal to reportId
    const {rows: [report]} = await client.query(
      `
      SELECT * FROM reports
      WHERE id = $1
    `,[reportId]);

    return report;
  } catch (error) {
    throw error;
  }
}


/**
 * You should update the report where the reportId 
 * and password match, setting isOpen to false.
 * 
 * If the report is updated this way, return an object
 * with a message of "Success".
 * 
 * If nothing is updated this way, throw an error
 */
async function closeReport(reportId, password) {
  try {
    // First, actually grab the report with that id
    const report = await _getReport(reportId);

    // If it doesn't exist, throw an error with a useful message
    
    if (!report) {
      throw new Error("Report does not exist with that id");
    }

    // If the passwords don't match, throw an error
    
    if (report.password !== password) {
      throw new Error("Password incorrect for this report, please try again");
    }


    // If it has already been closed, throw an error with a useful message
    
    if (!report.isOpen) {
      throw new Error("This report has already been closed");
    }
    // Finally, update the report if there are no failures, as above
    const { rowCount } = await client.query(
      `UPDATE reports SET "isOpen" = false WHERE id = $1`,
      [reportId]
    );

      if (rowCount === 0) {
      throw new Error("Report not updated");
    }

    // Return a message stating that the report has been closed
    return { message: "Report successfully closed!" };


  } catch (error) {
    throw error;
  }
}

/**
 * Comment Related Methods
 */

/**
 * If the report is not found, or is closed or expired, throw an error
 * 
 * Otherwise, create a new comment with the correct
 * reportId, and update the expirationDate of the original
 * report to CURRENT_TIMESTAMP + interval '1 day' 
 */
async function createReportComment(reportId, commentFields) {
  // read off the content from the commentFields
  const { content } = commentFields;

  try {
    // grab the report we are going to be commenting on
    const report = await _getReport(reportId);

    // if it wasn't found, throw an error saying so
    if (!report) {
      throw new Error("That report does not exist, no comment has been made");
    }

    // if it is not open, throw an error saying so
    
    if (!report.isOpen) {
      throw new Error("That report has been closed, no comment has been made");
    }

    // if the current date is past the expiration, throw an error saying so
    // you can use Date.parse(report.expirationDate) < new Date() to check
    if (Date.parse(report.expirationDate) < Date.now()) {
      throw new Error("The discussion time on this report has expired, no comment has been made");
    }

    // all go: insert a comment
    const { rows: [newComment] } = await client.query(
      `INSERT INTO comments ("reportId", content) VALUES ($1, $2) RETURNING *`,
      [reportId, content]
    );

    // then update the expiration date to a day from now
    await client.query(
      `UPDATE reports SET "expirationDate" = CURRENT_TIMESTAMP + interval '1 day' WHERE id = $1`,
      [reportId]
    );

    // finally, return the comment
    return newComment;

  } catch (error) {
    throw error;
  }
}

// export the client and all database functions below

module.exports = {
  client,
  getOpenReports,
  createReport,
  closeReport,
  createReportComment,
  _getReport
};








