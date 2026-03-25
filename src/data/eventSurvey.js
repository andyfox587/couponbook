// src/data/eventSurvey.js
export const eventSurveyJson = {
  title: "Submit an Event",
  showProgressBar: "top",
  pages: [
    {
      name: "metadata",
      elements: [
        {
          type: "dropdown",
          name: "group_id",
          title: "Select Foodie Group",
          isRequired: true,
          choices: [],
          searchEnabled: true
        },
        {
          type: "dropdown",
          name: "merchant_id",
          title: "Select Restaurant",
          isRequired: true,
          choices: [],
          searchEnabled: true
        },
        {
          type: "text",
          name: "name",
          title: "Event Name",
          isRequired: true,
          placeholder: "e.g. Wine Tasting Night"
        },
        {
          type: "comment",
          name: "description",
          title: "Description",
          isRequired: true,
          placeholder: "Describe your event, what guests can expect, dress code, etc."
        },
        {
          type: "text",
          name: "location",
          title: "Location",
          isRequired: false,
          placeholder: "e.g. 123 Main St, Chapel Hill, NC"
        }
      ]
    },
    {
      name: "datetime",
      elements: [
        {
          type: "text",
          name: "start_datetime",
          title: "Start Date & Time",
          inputType: "datetime-local",
          isRequired: true
        },
        {
          type: "text",
          name: "end_datetime",
          title: "End Date & Time",
          inputType: "datetime-local",
          isRequired: false
        },
        {
          type: "text",
          name: "capacity",
          title: "Capacity (0 = unlimited)",
          inputType: "number",
          defaultValue: 0,
          validators: [{ type: "numeric", minValue: 0 }],
          isRequired: false
        },
        {
          type: "text",
          name: "max_tickets_per_guest",
          title: "Max Tickets Per Guest",
          inputType: "number",
          defaultValue: 1,
          validators: [{ type: "numeric", minValue: 1 }],
          isRequired: false
        }
      ]
    },
    {
      name: "pricing",
      elements: [
        {
          type: "boolean",
          name: "is_free",
          title: "Is this a free event?",
          defaultValue: true
        },
        {
          type: "text",
          name: "price_dollars",
          title: "Ticket Price (USD)",
          inputType: "number",
          visibleIf: "{is_free} = false",
          requiredIf: "{is_free} = false",
          validators: [{ type: "numeric", minValue: 0 }],
          defaultValue: 0,
          description: "Enter the dollar amount (e.g. 25 for $25.00)"
        },
        {
          type: "text",
          name: "members_only_price_dollars",
          title: "Members-Only Price (USD)",
          inputType: "number",
          visibleIf: "{is_free} = false",
          validators: [{ type: "numeric", minValue: 0 }],
          defaultValue: 0,
          description: "Discounted price for Foodie Group members. Leave 0 to match regular price."
        },
        {
          type: "dropdown",
          name: "visibility",
          title: "Visibility",
          defaultValue: "public",
          isRequired: true,
          choices: [
            { value: "public", text: "Public — anyone can see and RSVP" },
            { value: "members_only", text: "Members Only — members-only pricing/access" },
            { value: "invite_only", text: "Invite Only — visible but RSVP is disabled" }
          ]
        }
      ]
    },
    {
      name: "images",
      title: "Event Images",
      elements: [
        {
          type: "html",
          name: "images_instructions",
          html: "<p style='color:inherit;margin:0'>Use the upload controls above to add a cover image and banner image for your event.</p>"
        },
        {
          type: "text",
          name: "cover_image_url",
          visible: false
        },
        {
          type: "text",
          name: "banner_image_url",
          visible: false
        }
      ]
    }
  ]
};
