CalendarUI.bind();
CalendarUI.refresh().catch(error=>CalendarUI.toast(error.message,true));
