# Subscription Management Guide

Admin documentation for this area. Edit this file in the module `docs/` folder; CI syncs to Supabase Storage on push to main.

## Overview

Describe workflows, permissions, and common tasks here.

## Detaching the Payment Dashboard

The Payment Dashboard (**Subscription & Billing → Payment Operations → Payment Dashboard**) has a **Detach** button next to the date filters. Clicking it opens the dashboard in its own browser window, without the sidebar or top navigation, so it can be moved to a second monitor — useful for keeping an eye on payment activity while running a simulation or test scenario elsewhere in the admin console.

The detached window is an independent copy: it starts with its own default 30-day date range rather than mirroring whatever range was selected in the original tab, and it does not update the original window or vice versa. Close it like any other browser window when you're done.
